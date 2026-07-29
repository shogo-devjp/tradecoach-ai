import type { EntryBlockLevel, EntryTiming, MarketCondition, RiskLevel, Signal, TodayAction, TrendDirection } from "./types";

export interface TimingInputs {
  signal: Signal;
  dailyTrend: TrendDirection;
  trend60m: TrendDirection | null;
  trend15m: TrendDirection | null;
  distanceToResistancePercent: number;
  marketCondition: MarketCondition;
  riskLevel: RiskLevel;
}

// TradeCoach AIは「エントリーを増やすAI」ではなく「不要なトレードを減らすAI」という方針のもと、
// 「待つ価値がない」ことが明確なケースは最優先で「本日は休みましょう」を返す。
// 　・待ち＝指標が完全に拮抗し優位性がない
// 　・地合いとシグナルが逆方向＝買いなのに地合いが弱い／売りなのに地合いが強い
// 　・リスクが高い＝初心者にはリスク管理が難しい
// これらに該当しない場合のみ「待つ価値がある」ケース（押し目待ち・ブレイク待ち・様子見）を判定する。
export function determineEntryTiming(inputs: TimingInputs): EntryTiming {
  if (inputs.signal === "待ち") return "本日は休みましょう";

  const marketAgainst =
    (inputs.signal === "買い" && inputs.marketCondition === "弱い") ||
    (inputs.signal === "売り" && inputs.marketCondition === "強い");
  if (marketAgainst) return "本日は休みましょう";

  if (inputs.riskLevel === "高") return "本日は休みましょう";

  if (inputs.signal === "売り") {
    // 「押し目待ち」「ブレイク待ち」は買い視点の概念（下がったら買う／上に抜けたら買う）のため、
    // 売りでは使わず、短期足が売り方向で一致していれば「今すぐエントリー」、それ以外は「様子見」とする。
    const shortTermAgainst =
      (inputs.trend60m !== null && inputs.trend60m !== "下降") ||
      (inputs.trend15m !== null && inputs.trend15m !== "下降");
    return shortTermAgainst ? "様子見" : "今すぐエントリー";
  }

  // 買い
  const shortTermDown = inputs.trend60m === "下降" && inputs.trend15m === "下降";
  if (shortTermDown) return "押し目待ち";

  const shortTermSplit =
    (inputs.trend60m === "下降" && inputs.trend15m !== "下降") ||
    (inputs.trend15m === "下降" && inputs.trend60m !== "下降");
  if (shortTermSplit) return "様子見";

  if (inputs.distanceToResistancePercent < 1.5) return "ブレイク待ち";

  return "今すぐエントリー";
}

function trendFactor(trend: TrendDirection | null, favorable: TrendDirection): number {
  if (trend === null) return 0.5; // データなし（スクリーニング等）は中立扱い
  if (trend === favorable) return 1;
  if (trend === "横ばい") return 0.5;
  return 0;
}

// 日足・60分足・15分足・地合いの4要素を均等に見て★1〜5の総合タイミング評価を出す。
// 「本日は休みましょう」の場合は★1に固定し、「休むべき日」であることを星の見た目でも一貫させる。
export function calculateEntryTimingScore(inputs: TimingInputs, entryTiming: EntryTiming): number {
  if (entryTiming === "本日は休みましょう") return 1;

  const favorableTrend: TrendDirection = inputs.signal === "買い" ? "上昇" : "下降";
  const favorableMarket: MarketCondition = inputs.signal === "買い" ? "強い" : "弱い";

  let sum = 0;
  sum += trendFactor(inputs.dailyTrend, favorableTrend);
  sum += trendFactor(inputs.trend60m, favorableTrend);
  sum += trendFactor(inputs.trend15m, favorableTrend);
  sum += inputs.marketCondition === favorableMarket ? 1 : inputs.marketCondition === "中立" ? 0.5 : 0;

  return Math.min(5, Math.max(1, Math.round((sum / 4) * 4 + 1)));
}

// 「今日やること」表示用。EntryBlockが"blocked"（複数の懸念材料が重なった）場合は
// タイミング判定に関わらず最優先で「見送り」を示す。
export function determineTodayAction(entryBlockLevel: EntryBlockLevel, entryTiming: EntryTiming): TodayAction {
  if (entryBlockLevel === "blocked") return "見送り";
  return entryTiming;
}

export interface TodayActionReasonInputs extends TimingInputs {
  support: number;
  resistance: number;
  entryBlockReason: string | null;
}

function yen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

// 「今日やること」の下に添える1〜2文の短い理由。ページ表示・LINE通知の両方で
// 同じ関数を使い、文言の二重管理を避ける。断定を避け「分析上は」等のヘッジを含める。
export function buildTodayActionReason(action: TodayAction, inputs: TodayActionReasonInputs): string {
  if (action === "見送り") {
    return `${inputs.entryBlockReason ?? "リスクが高い状態です。"}無理をせず本日は見送りましょう。`;
  }

  if (action === "本日は休みましょう") {
    if (inputs.signal === "待ち") {
      return `指標同士の方向感がバラバラで、今日は明確な優位性が見当たりません。何もしないことも立派な戦略です。`;
    }
    if (inputs.riskLevel === "高") {
      return `値動きの幅が大きく、初心者の方にはリスク管理が難しい状況です。無理をせず、今日は休むのも良い選択です。`;
    }
    const marketWord = inputs.signal === "買い" ? "弱く" : "強く";
    return `市場全体の地合いが${marketWord}、個別銘柄の条件だけでは判断が難しい状況です。無理をせず、今日は休むのも良い選択です。`;
  }

  if (action === "押し目待ち") {
    return `短期足（60分足・15分足）が下降中です。${yen(inputs.support)}付近が次の注目価格帯です。反発を確認できれば、エントリーを検討しやすくなります。`;
  }
  if (action === "ブレイク待ち") {
    return `直近の上値目安${yen(inputs.resistance)}が近づいています。ここを明確に上抜ければ、エントリーを検討しやすくなります。`;
  }
  if (action === "今すぐエントリー") {
    return `日足・短期足とも同じ方向にそろっています。分析上は、今が判断しやすいタイミングです。`;
  }

  // 様子見（短期足の方向感がまだ定まっていないケースのみ、ここに到達する）
  return `短期足の方向感が定まっていません。もう少し様子を見ましょう。`;
}
