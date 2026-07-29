import type { IndicatorReason, IndicatorStatus, ScoreBreakdownItem, Signal } from "./types";

interface ScoreInputs {
  rsiReason: IndicatorReason;
  macdReason: IndicatorReason;
  ma5Reason: IndicatorReason;
  ma25Reason: IndicatorReason;
  ma75Reason: IndicatorReason;
  dowTheoryReason: IndicatorReason;
  volumeReason: IndicatorReason;
}

export interface ScoreResult {
  score: number;
  signal: Signal;
  confidence: number;
  breakdown: ScoreBreakdownItem[];
}

const STATUS_WEIGHT: Record<IndicatorStatus, number> = {
  positive: 1,
  neutral: 0,
  negative: -1,
};

// 内訳表示用：各指標を10点満点に換算する（買い=10点・中立=5点・売り=0点）
export const STATUS_POINTS: Record<IndicatorStatus, number> = {
  positive: 10,
  neutral: 5,
  negative: 0,
};

// RSI・MACD・5日/25日/75日移動平均線・ダウ理論の6指標を方向性の判定材料とする
// （出来高は方向を持たないため、後段でスコアの補強にのみ使う。トレンド・サポレジは参考表示のみでスコアには使わない）
const DIRECTIONAL_KEYS = [
  "rsiReason",
  "macdReason",
  "ma5Reason",
  "ma25Reason",
  "ma75Reason",
  "dowTheoryReason",
] as const;

export function calculateScore(inputs: ScoreInputs): ScoreResult {
  const directionalReasons = DIRECTIONAL_KEYS.map((key) => inputs[key]);
  const directionalValues = directionalReasons.map((reason) => STATUS_WEIGHT[reason.status]);
  const total = directionalValues.reduce((sum, v) => sum + v, 0);
  const n = DIRECTIONAL_KEYS.length;

  // -n〜+n の合計スコアを 0〜100 にスケール
  const rawScore = ((total + n) / (2 * n)) * 100;

  // 出来高が値動きを裏付けている場合はスコアを方向に応じて微調整
  const volumeBoost = inputs.volumeReason.status === "positive" ? 5 : inputs.volumeReason.status === "negative" ? -5 : 0;
  const score = Math.min(100, Math.max(0, Math.round(rawScore + (total >= 0 ? volumeBoost : -volumeBoost))));

  let signal: Signal = "待ち";
  if (score >= 65) signal = "買い";
  else if (score <= 35) signal = "売り";

  // 6指標の合計が最大値(±n)にどれだけ近いか＝一致度合いを信頼度とする
  // （neutralな指標が多いほど、また指標が割れているほど信頼度は下がる）
  const confidence = Math.round((Math.abs(total) / n) * 100);

  const breakdown: ScoreBreakdownItem[] = directionalReasons.map((reason) => ({
    label: reason.label,
    points: STATUS_POINTS[reason.status],
    status: reason.status,
    contributesToScore: true,
  }));

  return { score, signal, confidence, breakdown };
}
