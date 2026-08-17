import type {
  CurrencyPairConfig,
  FxDecision,
  FxPriceLevels,
  MarketRegime,
  MultiTimeframeResult,
  RiskRewardResult,
  SessionInfo,
  WaitReasonCode,
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

// WaitReasonCode（app/lib/fx/decision/decision.ts）を、AIコーチコメント用の短い理由節に変換する
// 表示専用のマップ。判定ロジック・閾値には一切関与しない。
const WAIT_SHORT_REASON: Record<WaitReasonCode, string> = {
  TREND_UNCLEAR: "BUY/SELLどちらの根拠も弱い",
  HIGHER_LOWER_CONFLICT: "上位足と下位足の方向が揃っていない",
  EXTREME_VOLATILITY: "値動きが荒すぎる",
  STOP_TOO_FAR: "損切りまでの距離が遠すぎる",
  POOR_RISK_REWARD: "リスクリワードが目安に届いていない",
  MID_RANGE_SR: "主要な節目の中間で根拠が弱い",
  INDICATOR_CONFLICT: "上位足トレンドとモメンタムが矛盾している",
  ECONOMIC_EVENT_RISK: "重要指標の発表が近い",
};

// TradeCoach AIは売買を断定するコーチではなく判断支援ツールであるため、AIコーチコメントは
// 「買いです／売りです」と言い切らず、「エントリー候補として検討できる」という位置付けの
// 1〜2文に絞る。詳しい理由づけはFxReasonsList（判定理由セクション）に譲る。
export function generateFxComment(ctx: CommentContext): string {
  const { pair, decision, priceLevels, riskReward } = ctx;

  if (decision.signal === "待ち") {
    return buildWaitComment(ctx);
  }

  const zone =
    decision.signal === "買い"
      ? `${fmt(priceLevels.entryLow, pair)}〜${fmt(priceLevels.entryHigh, pair)}`
      : `${fmt(priceLevels.entryHigh, pair)}〜${fmt(priceLevels.entryLow, pair)}`;

  return (
    `${pair.displayName}は${zone}付近が${decision.signal}のエントリー候補ゾーンです。` +
    `条件が揃っているため検討できます（リスクリワード 1:${riskReward.ratio.toFixed(1)}）。` +
    `損切り目安は${fmt(priceLevels.stopLoss, pair)}、利益確定目安は${fmt(priceLevels.takeProfit1, pair)}です。`
  );
}

function buildWaitComment(ctx: CommentContext): string {
  const { pair, decision } = ctx;
  const primaryCode = decision.waitReasonCodes[0];
  const reasonClause = primaryCode ? WAIT_SHORT_REASON[primaryCode] : "明確な優位性が確認できない";

  return `${pair.displayName}は今は待ちです。${reasonClause}ため様子を見ています。条件が揃ったら再チェックしましょう。`;
}
