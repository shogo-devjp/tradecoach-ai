import type { EntryBlock, IndicatorStatus, MarketCondition, RiskLevel, Signal } from "./types";

export interface EntryBlockInputs {
  signal: Signal;
  riskLevel: RiskLevel;
  confidence: number;
  atrPercent: number;
  riskReward: number;
  marketCondition: MarketCondition;
  dowTheoryStatus: IndicatorStatus;
}

// 以下のいずれかに該当する場合を「懸念材料」として数える。
// ・リスクが高くかつ指標の一致度（信頼度）が低い＝根拠が乏しいまま高リスクを取ることになる
// ・ATRが現在値の6%以上＝値幅が大きすぎて損切ラインの想定が難しい
// ・リスクリワード比が1未満＝想定損失より想定利益の方が小さい割に合わない取引
// ・地合いが悪い＝買いなのに市場全体が弱い、または売りなのに市場全体が強い（逆風での逆張り）
// ・ダウ理論が逆行＝買いなのにダウ理論は下降トレンド、または売りなのに上昇トレンド
//
// 懸念材料が1つだけなら「注意」に留め、2つ以上重なった場合のみ「エントリー見送り」を発動する。
// （リスクリワードが悪いだけ等、単独の懸念で毎回エントリーを止めてしまうと過剰検出になるため）
export function assessEntryBlock(inputs: EntryBlockInputs): EntryBlock {
  const { signal, riskLevel, confidence, atrPercent, riskReward, marketCondition, dowTheoryStatus } = inputs;
  const reasons: string[] = [];

  if (riskLevel === "高" && confidence < 40) {
    reasons.push("リスクが高くかつ指標の一致度が低いため根拠が乏しい");
  }
  if (atrPercent >= 6) {
    reasons.push(`値動きの幅(ATR)が現在値の${atrPercent.toFixed(1)}%と大きくリスク管理が難しい`);
  }
  if (riskReward > 0 && riskReward < 1) {
    reasons.push(`リスクリワード比が${riskReward.toFixed(2)}倍と損失に対して利益が見合っていない`);
  }

  const marketAgainst =
    (signal === "買い" && marketCondition === "弱い") || (signal === "売り" && marketCondition === "強い");
  if (marketAgainst) {
    reasons.push("市場全体（日経平均・TOPIX）の地合いが悪く逆風のなかでの取引になる");
  }

  const dowAgainst =
    (signal === "買い" && dowTheoryStatus === "negative") || (signal === "売り" && dowTheoryStatus === "positive");
  if (dowAgainst) {
    reasons.push("ダウ理論では判定と逆方向のトレンドが継続している");
  }

  const reason = reasons.length > 0 ? reasons.join("。") + "。" : null;

  if (reasons.length >= 2) {
    return { level: "blocked", reason };
  }
  if (reasons.length === 1) {
    return { level: "caution", reason };
  }
  return { level: "none", reason: null };
}
