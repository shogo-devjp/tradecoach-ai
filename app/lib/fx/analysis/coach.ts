import type {
  FxDecisionResult,
  FxPriceLevels,
  FxRiskReward,
  FxSessionState,
  MarketRegimeResult,
  MultiTimeframeResult,
} from "../types";

function fmt(value: number): string {
  return value.toFixed(3);
}

// 初心者にも分かる日本語で「なぜ／どこまで待つか／どこを割るとシナリオ崩壊か」を説明する（要件14）。
// 「買いです」で終わらせず、値ごとの根拠と無効化ライン（シナリオが崩れる価格）まで言及する。
export function generateFxCoachComment(inputs: {
  pairDisplayName: string;
  decision: FxDecisionResult;
  regime: MarketRegimeResult;
  multiTimeframe: MultiTimeframeResult;
  priceLevels: FxPriceLevels;
  riskReward: FxRiskReward;
  session: FxSessionState;
}): string {
  const { pairDisplayName, decision, regime, multiTimeframe, priceLevels, riskReward, session } = inputs;
  const tf4h = multiTimeframe.byTimeframe["4h"];
  const tf1h = multiTimeframe.byTimeframe["1h"];
  const rsi1h = tf1h?.indicators.rsi14 ?? null;

  if (decision.decision === "WAIT") {
    const reasonText = decision.waitOverrideReason ?? decision.reasons[0] ?? "方向感がはっきりしません";
    return `${pairDisplayName}は現在「待ち」の判断です。${reasonText}。無理にポジションを持たず、次に条件がそろうまで様子を見ましょう。何もしないことも立派な戦略です。（${regime.comment}${session.comment}）`;
  }

  const rrSentence = riskReward.ratio > 0 ? `リスクリワード比は1：${riskReward.ratio.toFixed(1)}です。` : "";

  if (decision.decision === "BUY") {
    const trendSentence = tf4h ? `現在は4時間足まで${tf4h.direction}トレンドです。` : "";
    const overheatSentence = rsi1h !== null && rsi1h >= 65 ? "ただし短期的には少し買われすぎています。" : "";
    const entrySentence = `今すぐ追いかけて買うより、${fmt(priceLevels.entryLow)}付近まで押した場合の買いを狙う方がリスクを抑えられます。`;
    const invalidateSentence = `${fmt(priceLevels.stopLoss)}を明確に下回った場合はこのシナリオが崩れるため、損切りを検討しましょう。`;
    return `${trendSentence}${overheatSentence}${entrySentence}${rrSentence}${invalidateSentence}`;
  }

  // SELL
  const trendSentence = tf4h ? `現在は4時間足まで${tf4h.direction}トレンドです。` : "";
  const oversoldSentence = rsi1h !== null && rsi1h <= 35 ? "ただし短期的には少し売られすぎています。" : "";
  const entrySentence = `今すぐ飛びついて売るより、${fmt(priceLevels.entryHigh)}付近まで戻した場合の売りを狙う方がリスクを抑えられます。`;
  const invalidateSentence = `${fmt(priceLevels.stopLoss)}を明確に上回った場合はこのシナリオが崩れるため、損切りを検討しましょう。`;
  return `${trendSentence}${oversoldSentence}${entrySentence}${rrSentence}${invalidateSentence}`;
}
