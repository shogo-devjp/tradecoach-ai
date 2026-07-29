import YahooFinance from "yahoo-finance2";
import { calculateSMA } from "@/app/lib/technicalAnalysis/indicators/sma";
import { determineTrend } from "@/app/lib/technicalAnalysis/trend";
import { buildOHLCVSeries } from "@/app/lib/technicalAnalysis/buildSeries";
import type { IndexCondition, MarketCondition, MarketRegime, TrendDirection } from "@/app/lib/technicalAnalysis/types";
import { getCachedMarketRegime, setCachedMarketRegime } from "./cache";

const yahooFinance = new YahooFinance();

// ^TOPX（TOPIX）はyahoo-finance2でスキーマ検証エラーが発生し取得できないため、
// TOPIX連動ETF（1306.T、野村アセットマネジメント）を代替指標として使用する。
const NIKKEI225_SYMBOL = "^N225";
const TOPIX_PROXY_SYMBOL = "1306.T";

function trendToCondition(trend: TrendDirection): MarketCondition {
  if (trend === "上昇") return "強い";
  if (trend === "下降") return "弱い";
  return "中立";
}

async function fetchIndexCondition(symbol: string): Promise<IndexCondition> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - 200);

  const [quote, chart] = await Promise.all([
    yahooFinance.quote(symbol),
    yahooFinance.chart(symbol, { period1, interval: "1d" }),
  ]);

  const series = buildOHLCVSeries(chart);
  const { closes } = series;
  const last = closes.length - 1;

  const sma25 = calculateSMA(closes, 25);
  const sma75 = calculateSMA(closes, 75);
  const { trend } = determineTrend(closes[last], sma25[last]!, sma75[last]!);

  return {
    price: quote.regularMarketPrice ?? closes[last],
    changePercent: quote.regularMarketChangePercent ?? 0,
    trend,
    condition: trendToCondition(trend),
  };
}

function combineOverall(nikkei225: IndexCondition, topix: IndexCondition): MarketCondition {
  if (nikkei225.condition === "強い" && topix.condition === "強い") return "強い";
  if (nikkei225.condition === "弱い" && topix.condition === "弱い") return "弱い";
  return "中立";
}

function buildMarketComment(overall: MarketCondition): string {
  if (overall === "強い") return "市場全体は強気です。";
  if (overall === "弱い") return "市場全体が弱いため慎重に。";
  return "市場全体は方向感に乏しい展開です。";
}

// 日経平均・TOPIXは全銘柄で共通のため、1日1回だけ取得してプロセス内キャッシュを使い回す
// （個別銘柄分析・スクリーニング双方から呼ばれても再取得しない）。
export async function getMarketRegime(): Promise<MarketRegime> {
  const cached = getCachedMarketRegime();
  if (cached) return cached;

  const [nikkei225, topix] = await Promise.all([
    fetchIndexCondition(NIKKEI225_SYMBOL),
    fetchIndexCondition(TOPIX_PROXY_SYMBOL),
  ]);

  const overall = combineOverall(nikkei225, topix);
  const regime: MarketRegime = { nikkei225, topix, overall, comment: buildMarketComment(overall) };
  return setCachedMarketRegime(regime);
}
