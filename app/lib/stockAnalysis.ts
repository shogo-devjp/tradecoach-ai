import YahooFinance from "yahoo-finance2";
import { runTechnicalAnalysis } from "@/app/lib/technicalAnalysis/analyze";
import { buildOHLCVSeries } from "@/app/lib/technicalAnalysis/buildSeries";
import { getMarketRegime } from "@/app/lib/marketRegime/marketRegime";
import { recordJudgment } from "@/app/lib/verification/store";
import { resolveCompanyName } from "@/app/lib/companyNames/master";
import { pickBeginnerAdvice } from "@/app/lib/technicalAnalysis/checkpoints";

const yahooFinance = new YahooFinance();

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export interface AnalyzeOptions {
  // 個別銘柄の詳細分析では60分足・15分足も取得してマルチタイムフレーム分析を行う。
  // 一括スクリーニング（日経225スキャン）は銘柄数が多くAPI呼び出しが増えるため、
  // includeIntraday:false で日足＋地合いのみの軽量分析にする。
  includeIntraday?: boolean;
}

export async function analyzeStockByCode(code: string, options: AnalyzeOptions = {}) {
  const { includeIntraday = true } = options;
  const symbol = `${code}.T`;
  const period1 = new Date();
  period1.setDate(period1.getDate() - 365);

  // Yahoo側の「過去60日以内」制約ちょうどの境界だとタイムゾーン誤差等で稀に拒否されることがあるため、
  // 59日にして余裕を持たせる。
  const intradayPeriod1 = new Date();
  intradayPeriod1.setDate(intradayPeriod1.getDate() - 59);

  // 60分足・15分足の取得はマルチタイムフレーム分析の補助情報であり必須ではないため、
  // 失敗しても分析全体を失敗させず null にフォールバックする（quote/chart/marketRegimeは必須のまま）。
  const [quote, chart, marketRegime, chart60m, chart15m] = await Promise.all([
    yahooFinance.quote(symbol),
    yahooFinance.chart(symbol, { period1, interval: "1d" }),
    getMarketRegime(),
    includeIntraday
      ? yahooFinance.chart(symbol, { period1: intradayPeriod1, interval: "60m" }).catch(() => null)
      : null,
    includeIntraday
      ? yahooFinance.chart(symbol, { period1: intradayPeriod1, interval: "15m" }).catch(() => null)
      : null,
  ]);

  const series = buildOHLCVSeries(chart);
  const intraday =
    chart60m && chart15m
      ? { closes60m: buildOHLCVSeries(chart60m).closes, closes15m: buildOHLCVSeries(chart15m).closes }
      : null;

  const analysis = runTechnicalAnalysis(series, { marketRegime, intraday });

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
  };

  // 検証モード用の記録。ファイルI/Oの失敗が分析結果の返却を妨げないよう隔離する。
  // AIが外れた理由を後から分析できるよう、地合い・ダウ理論・ATR・出来高倍率・
  // エントリータイミングも合わせて保存する。
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
  }).catch((error) => console.error("[verification] 判定の記録に失敗しました:", error));

  return result;
}

export type StockAnalysis = Awaited<ReturnType<typeof analyzeStockByCode>>;
