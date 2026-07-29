import type { IndicatorReason, Signal } from "./types";

interface IndicatorSet {
  movingAverage5: IndicatorReason;
  movingAverage25: IndicatorReason;
  movingAverage75: IndicatorReason;
  macd: IndicatorReason;
  rsi: IndicatorReason;
  dowTheory: IndicatorReason;
  volume: IndicatorReason;
}

const REASON_PHRASES: Record<string, { positive: string; negative: string }> = {
  "5日移動平均線": { positive: "5日移動平均線を上回り短期は強含み", negative: "5日移動平均線を下回り短期は弱含み" },
  "25日移動平均線": { positive: "25日移動平均線を上回り中期は強含み", negative: "25日移動平均線を下回り中期は弱含み" },
  "75日移動平均線": { positive: "75日移動平均線を上回り長期は強含み", negative: "75日移動平均線を下回り長期は弱含み" },
  MACD: { positive: "MACDが好転しモメンタム上昇", negative: "MACDが悪化しモメンタム下降" },
  RSI: { positive: "売られすぎ水準で押し目候補", negative: "買われすぎ水準で過熱感あり" },
  ダウ理論: { positive: "ダウ理論で上昇トレンド継続", negative: "ダウ理論で下降トレンド継続" },
  出来高: { positive: "出来高が増加し注目度上昇", negative: "出来高が細り勢い弱め" },
};

// 売買判定と同じ向きの指標だけを「根拠」として抜き出す。
// 「待ち」は指標が拮抗していること自体が理由なので、方向を問わず中立以外を採用する。
export function buildReasons(signal: Signal, indicators: IndicatorSet): string[] {
  const matchesSignal = (status: IndicatorReason["status"]): status is "positive" | "negative" => {
    if (signal === "買い") return status === "positive";
    if (signal === "売り") return status === "negative";
    return status !== "neutral";
  };

  const reasons = Object.values(indicators)
    .filter((reason) => matchesSignal(reason.status))
    .map((reason) => REASON_PHRASES[reason.label]?.[reason.status as "positive" | "negative"])
    .filter((phrase): phrase is string => Boolean(phrase));

  return reasons.length > 0 ? reasons : ["指標間で方向感が乏しく、明確な根拠は出ていません"];
}
