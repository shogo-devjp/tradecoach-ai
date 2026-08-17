import type { MarketRegimeResult, TimeframeAnalysis, VolatilityLevel } from "../types";

// 相場環境判定の閾値。USD/JPYを基準にした目安値のため、他通貨ペアを有効化する際は
// ボラティリティの水準感が異なる可能性があるので見直しが必要（config化してここに集約）。
export const REGIME_THRESHOLDS = {
  adxTrendThreshold: 25,
  highVolatilityAtrPercent: 0.15,
  lowVolatilityAtrPercent: 0.04,
};

function classifyVolatility(atrPercent: number | null): VolatilityLevel {
  if (atrPercent === null) return "normal";
  if (atrPercent >= REGIME_THRESHOLDS.highVolatilityAtrPercent) return "high";
  if (atrPercent <= REGIME_THRESHOLDS.lowVolatilityAtrPercent) return "low";
  return "normal";
}

// 相場環境は「トレンドか、レンジか、それとも極端なボラティリティか」という単一の内部状態として管理する
// （要件5：TREND_UP/TREND_DOWN/RANGE/HIGH_VOLATILITY/LOW_VOLATILITYの5値）。
// トレンド判定は4時間足（中期トレンド。ノイズが少なくADXが安定しやすい）、
// ボラティリティ判定は1時間足（現在の値動きの大きさ）を基準に行う。
// なお高ボラティリティかどうかはこのstateとは別にvolatilityLevelとして常に併記する。
// これは「トレンド中でも高ボラなら厳格化する」（要件5の例）をスコアリング側で組み合わせて使えるようにするため。
export function detectMarketRegime(
  trendTimeframe: TimeframeAnalysis | null,
  volatilityTimeframe: TimeframeAnalysis | null
): MarketRegimeResult {
  const adx = trendTimeframe?.indicators.adx14 ?? null;
  const atrPercent = volatilityTimeframe?.indicators.atrPercent ?? null;
  const bbWidthPercent = volatilityTimeframe?.indicators.bbWidthPercent ?? null;
  const volatilityLevel = classifyVolatility(atrPercent);

  let state: MarketRegimeResult["state"];
  let comment: string;

  const isTrending = adx !== null && adx >= REGIME_THRESHOLDS.adxTrendThreshold;

  if (isTrending && trendTimeframe?.direction === "上昇") {
    state = "TREND_UP";
    comment = `4時間足のADXが${adx!.toFixed(1)}と高く、上昇トレンドが継続しています。押し目買いを優先する場面です。`;
  } else if (isTrending && trendTimeframe?.direction === "下降") {
    state = "TREND_DOWN";
    comment = `4時間足のADXが${adx!.toFixed(1)}と高く、下降トレンドが継続しています。戻り売りを優先する場面です。`;
  } else if (volatilityLevel === "high") {
    state = "HIGH_VOLATILITY";
    comment = `値動きの幅（ATR）が現在値の${atrPercent!.toFixed(2)}%と大きく、変動が荒い相場です。エントリー条件を厳しめに見る場面です。`;
  } else if (volatilityLevel === "low") {
    state = "LOW_VOLATILITY";
    comment = `値動きの幅が小さく、方向感の出にくい落ち着いた相場です。ブレイクを待つのが基本になります。`;
  } else {
    state = "RANGE";
    comment = `明確なトレンドが出ておらずレンジ相場です。サポート・レジスタンスを重視する場面です。`;
  }

  return { state, volatilityLevel, adx, atrPercent, bbWidthPercent, comment };
}
