import YahooFinance from "yahoo-finance2";
import { runTechnicalAnalysis } from "@/app/lib/technicalAnalysis/analyze";
import { buildOHLCVSeries } from "@/app/lib/technicalAnalysis/buildSeries";
import { getMarketRegime } from "@/app/lib/marketRegime/marketRegime";
import { recordJudgment } from "@/app/lib/verification/store";
import { resolveCompanyName } from "@/app/lib/companyNames/master";
import { pickBeginnerAdvice } from "@/app/lib/technicalAnalysis/checkpoints";
import { calcDaysFromEarnings, getEarningsInfo, isEarningsRisk } from "@/app/lib/earnings/earningsCalendar";

const yahooFinance = new YahooFinance();

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export interface AnalyzeOptions {
  // 個別銘柄の詳細分析では60分足・15分足も取得してマルチタイムフレーム分析を行う。
  // 一括スクリーニング（日経225スキャン）は銘柄数が多くAPI呼び出しが増えるため、
  // includeIntraday:false で日足＋地合いのみの軽量分析にする。
  includeIntraday?: boolean;
  // verificationログ（app/lib/verification/data/log.json）へ記録するかどうか。
  // デフォルトは必ずtrue＝既存の本番挙動（朝夕バッチ・個別銘柄ページ閲覧）を一切変更しない。
  // 開発・性能測定スクリプトからのみ明示的にfalseを渡し、本番verificationデータを汚さずに
  // analyzeStockByCode()を呼べるようにする（Paper Trading Phase1の225銘柄実測で本番ログが
  // 汚染された反省を踏まえた追加オプション）。
  recordVerification?: boolean;
}

export async function analyzeStockByCode(code: string, options: AnalyzeOptions = {}) {
  const { includeIntraday = true, recordVerification = true } = options;
  const symbol = `${code}.T`;
  const period1 = new Date();
  period1.setDate(period1.getDate() - 365);

  // Yahoo側の「過去60日以内」制約ちょうどの境界だとタイムゾーン誤差等で稀に拒否されることがあるため、
  // 59日にして余裕を持たせる。
  const intradayPeriod1 = new Date();
  intradayPeriod1.setDate(intradayPeriod1.getDate() - 59);

  // 60分足・15分足の取得はマルチタイムフレーム分析の補助情報であり必須ではないため、
  // 失敗しても分析全体を失敗させず null にフォールバックする（quote/chart/marketRegimeは必須のまま）。
  const [quote, chart, marketRegime, chart60m, chart15m, earnings] = await Promise.all([
    yahooFinance.quote(symbol),
    yahooFinance.chart(symbol, { period1, interval: "1d" }),
    getMarketRegime(),
    includeIntraday
      ? yahooFinance.chart(symbol, { period1: intradayPeriod1, interval: "60m" }).catch(() => null)
      : null,
    includeIntraday
      ? yahooFinance.chart(symbol, { period1: intradayPeriod1, interval: "15m" }).catch(() => null)
      : null,
    // 決算発表日はVersion 1.2でverificationログへの記録・UI警告表示のみに使う
    // （AIスコア・シグナル・EntryBlockの判定条件にはまだ使わない）。取得失敗時はnullフォールバック。
    getEarningsInfo(code).catch(() => ({ earningsDate: null, isEstimate: false })),
  ]);

  const series = buildOHLCVSeries(chart);
  const intraday =
    chart60m && chart15m
      ? { closes60m: buildOHLCVSeries(chart60m).closes, closes15m: buildOHLCVSeries(chart15m).closes }
      : null;

  const analysis = runTechnicalAnalysis(series, { marketRegime, intraday });

  // Version 1.2: 決算発表日と判定日の関係を後から再計算できる生データとして保存する
  // （「決算前」「決算後」の比較用。daysFromEarningsは負数=決算前、0=決算当日、正数=決算後）。
  const judgedAt = todayKey();
  const daysFromEarnings = calcDaysFromEarnings(judgedAt, earnings.earningsDate);
  const earningsRiskFlag = isEarningsRisk(daysFromEarnings);

  const result = {
    symbol: quote.symbol,
    name: resolveCompanyName(code, quote.longName ?? quote.shortName ?? code),
    price: quote.regularMarketPrice,
    change: quote.regularMarketChange,
    changePercent: quote.regularMarketChangePercent,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    open: quote.regularMarketOpen,
    ...analysis,
    // 初心者向けアドバイスはcode（銘柄コード）に依存するため、コードを知らない
    // 純粋関数runTechnicalAnalysisの中では計算せず、ここで後付けする。
    beginnerAdvice: pickBeginnerAdvice(code, todayKey(), analysis.todayAction),
    // 決算リスク（Version 1.2）。UI警告表示専用で、スコア・シグナル・EntryBlockには使わない。
    earningsDate: earnings.earningsDate,
    daysFromEarnings,
    earningsRiskFlag,
    earningsIsEstimate: earnings.isEstimate,
  };

  // 検証モード用の記録。ファイルI/Oの失敗が分析結果の返却を妨げないよう隔離する。
  // AIが外れた理由を後から分析できるよう、地合い・ダウ理論・ATR・出来高倍率・
  // エントリータイミングに加え、Version 1.2ではRSI/MACD/MA・EntryBlock・risk・todayAction・
  // 地合いの内訳・イントラデイトレンド・決算リスクも合わせて保存する。
  // recordVerification:false（開発・性能測定専用）の場合はこの副作用自体をスキップする。
  if (recordVerification) {
    recordJudgment({
      code,
      name: result.name ?? code,
      score: result.score,
      signal: result.signal,
      price: result.price ?? 0,
      marketCondition: result.marketRegime.overall,
      dowTheoryStatus: result.indicators.dowTheory.status,
      atrPercent: result.atrPercent,
      volumeRatio: result.indicators.volume.ratio,
      entryTiming: result.entryTiming,
      indicatorValues: result.indicatorValues,
      entryBlockLevel: result.entryBlock.level,
      entryBlockReason: result.entryBlock.reason,
      riskLevel: result.risk.level,
      todayAction: result.todayAction,
      todayActionReason: result.todayActionReason,
      marketRegimeDetail: { nikkei225: result.marketRegime.nikkei225, topix: result.marketRegime.topix },
      trend60m: result.trend60m,
      trend15m: result.trend15m,
      earningsDate: earnings.earningsDate,
      daysFromEarnings,
      earningsRiskFlag,
      earningsIsEstimate: earnings.isEstimate,
    }).catch((error) => console.error("[verification] 判定の記録に失敗しました:", error));
  }

  return result;
}

export type StockAnalysis = Awaited<ReturnType<typeof analyzeStockByCode>>;
