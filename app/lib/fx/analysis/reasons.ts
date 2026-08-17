import type { FxRiskReward, MarketRegimeResult, MultiTimeframeResult } from "../types";

// 「なぜその判定なのか」を箇条書きで示すための根拠一覧（要件7）。
// スコア計算に使った要素をそのまま人間が読める文章に変換するだけで、判定ロジック自体はここでは持たない。
export function buildFxReasons(inputs: {
  regime: MarketRegimeResult;
  multiTimeframe: MultiTimeframeResult;
  riskReward: FxRiskReward;
}): string[] {
  const { regime, multiTimeframe, riskReward } = inputs;
  const reasons: string[] = [];

  const tf1d = multiTimeframe.byTimeframe["1d"];
  const tf4h = multiTimeframe.byTimeframe["4h"];
  const tf1h = multiTimeframe.byTimeframe["1h"];
  const tf15m = multiTimeframe.byTimeframe["15m"];

  if (tf1d) reasons.push(`日足は${tf1d.direction}方向です`);
  if (tf4h) reasons.push(`4時間足は${tf4h.direction}方向です`);
  if (tf1h) reasons.push(`1時間足は${tf1h.direction}方向です`);
  if (tf15m) reasons.push(`15分足は${tf15m.direction}方向で、押し目/戻りの形成状況の参考になります`);

  const rsi1h = tf1h?.indicators.rsi14;
  if (rsi1h !== null && rsi1h !== undefined) {
    if (rsi1h >= 70) reasons.push(`1時間足のRSIは${rsi1h.toFixed(1)}で買われすぎ水準です`);
    else if (rsi1h <= 30) reasons.push(`1時間足のRSIは${rsi1h.toFixed(1)}で売られすぎ水準です`);
    else reasons.push(`1時間足のRSIは${rsi1h.toFixed(1)}で過熱していません`);
  }

  const atrPercent1h = tf1h?.indicators.atrPercent;
  if (atrPercent1h !== null && atrPercent1h !== undefined) {
    const level = regime.volatilityLevel === "high" ? "大きめ" : regime.volatilityLevel === "low" ? "小さめ" : "正常範囲";
    reasons.push(`ATR（値動きの幅）は現在値の${atrPercent1h.toFixed(2)}%で${level}の水準です`);
  }

  if (tf4h?.indicators.support !== null && tf4h?.indicators.support !== undefined) {
    reasons.push(`直近サポート${tf4h.indicators.support.toFixed(3)}・レジスタンス${tf4h.indicators.resistance?.toFixed(3) ?? "-"}付近を意識しています`);
  }

  reasons.push(regime.comment);

  if (riskReward.ratio > 0) {
    reasons.push(`リスクリワード比は1：${riskReward.ratio.toFixed(1)}です`);
  }

  return reasons;
}
