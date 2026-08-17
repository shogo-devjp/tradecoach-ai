import type {
  CurrencyPairConfig,
  FxDecision,
  FxPriceLevels,
  MarketRegime,
  MultiTimeframeResult,
  RiskRewardResult,
  SessionInfo,
} from "../types";

interface CommentContext {
  pair: CurrencyPairConfig;
  price: number;
  decision: FxDecision;
  marketRegime: MarketRegime;
  session: SessionInfo;
  multiTimeframe: MultiTimeframeResult;
  priceLevels: FxPriceLevels;
  riskReward: RiskRewardResult;
}

function fmt(value: number, pair: CurrencyPairConfig): string {
  return value.toFixed(pair.priceDecimals);
}

// 初心者でも分かる日本語で、「なぜ」「どこまで待つか」「どこを割るとシナリオ崩壊か」を
// 必ず含める（要件14）。「買いです」だけで終わらせないことを重視する。
export function generateFxComment(ctx: CommentContext): string {
  const { pair, price, decision, marketRegime, priceLevels, riskReward, multiTimeframe } = ctx;

  if (decision.signal === "待ち") {
    return buildWaitComment(ctx);
  }

  const higherTf = multiTimeframe.perTimeframe.find((tf) => tf.timeframe === "4h");
  const higherTfText = higherTf ? `4時間足まで${higherTf.direction === "up" ? "上昇" : higherTf.direction === "down" ? "下降" : "横ばい"}基調` : "";

  if (decision.signal === "買い") {
    const zone = `${fmt(priceLevels.entryLow, pair)}〜${fmt(priceLevels.entryHigh, pair)}`;
    return (
      `現在の${pair.displayName}は${higherTfText}です。相場環境は${marketRegime.label}と判定しています。` +
      `${zone}付近での買いを想定しており、リスクリワードは1：${riskReward.ratio.toFixed(1)}です。` +
      `想定が崩れる目安（シナリオ崩壊ライン）は${fmt(priceLevels.stopLoss, pair)}です。ここを明確に下抜けた場合はシナリオが崩れるため、損切りを検討してください。` +
      `逆に${fmt(priceLevels.takeProfit1, pair)}付近が最初の利益確定の目安、さらに伸びれば${fmt(priceLevels.takeProfit2, pair)}も視野に入ります。` +
      `今すぐ${fmt(price, pair)}で飛び乗るより、${zone}付近まで調整するのを待つ方がリスクを抑えられます。`
    );
  }

  // 売り
  const zone = `${fmt(priceLevels.entryHigh, pair)}〜${fmt(priceLevels.entryLow, pair)}`;
  return (
    `現在の${pair.displayName}は${higherTfText}です。相場環境は${marketRegime.label}と判定しています。` +
    `${zone}付近での売りを想定しており、リスクリワードは1：${riskReward.ratio.toFixed(1)}です。` +
    `想定が崩れる目安（シナリオ崩壊ライン）は${fmt(priceLevels.stopLoss, pair)}です。ここを明確に上抜けた場合はシナリオが崩れるため、損切りを検討してください。` +
    `逆に${fmt(priceLevels.takeProfit1, pair)}付近が最初の利益確定の目安、さらに下げれば${fmt(priceLevels.takeProfit2, pair)}も視野に入ります。` +
    `今すぐ${fmt(price, pair)}で飛び乗るより、${zone}付近まで戻すのを待つ方がリスクを抑えられます。`
  );
}

function buildWaitComment(ctx: CommentContext): string {
  const { pair, price, decision, marketRegime, session } = ctx;
  const reasonText = decision.reasons.length > 0 ? decision.reasons.join("。また、") : "明確な優位性が確認できません";

  return (
    `現在の${pair.displayName}は${fmt(price, pair)}、相場環境は${marketRegime.label}、セッションは${session.label}です。` +
    `分析の結果、今は無理にエントリーしない「待ち」を推奨します。理由は${reasonText}。` +
    `次にエントリーを検討するタイミングとしては、上位足と下位足の方向感がそろい、リスクリワードが十分に取れる水準まで価格が動くのを待つのが安全です。` +
    `チャンスはまた巡ってきますので、今は値動きを観察する時間と捉えましょう。`
  );
}
