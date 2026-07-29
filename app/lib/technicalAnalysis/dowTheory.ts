import type { IndicatorReason } from "./types";

interface SwingPoint {
  index: number;
  value: number;
}

// 前後window日よりも高い/安い日をスイング高値・安値とみなす単純なピボット検出
function findSwingHighs(values: number[], window: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = window; i < values.length - window; i++) {
    const slice = values.slice(i - window, i + window + 1);
    if (values[i] === Math.max(...slice)) {
      swings.push({ index: i, value: values[i] });
    }
  }
  return swings;
}

function findSwingLows(values: number[], window: number): SwingPoint[] {
  const swings: SwingPoint[] = [];
  for (let i = window; i < values.length - window; i++) {
    const slice = values.slice(i - window, i + window + 1);
    if (values[i] === Math.min(...slice)) {
      swings.push({ index: i, value: values[i] });
    }
  }
  return swings;
}

// ダウ理論：直近2つのスイング高値・安値が「ともに切り上げ」なら上昇トレンド、
// 「ともに切り下げ」なら下降トレンド、それ以外はトレンド転換期とみなす。
// スコア計算には使わず、トレンド・サポレジと同じ参考表示指標として扱う。
export function assessDowTheory(highs: number[], lows: number[], lookback = 90, window = 3): IndicatorReason {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  const swingHighs = findSwingHighs(recentHighs, window);
  const swingLows = findSwingLows(recentLows, window);

  if (swingHighs.length < 2 || swingLows.length < 2) {
    return {
      label: "ダウ理論",
      value: "スイング高値・安値のデータが不十分なため判定できません",
      status: "neutral",
    };
  }

  const [prevHigh, lastHigh] = swingHighs.slice(-2);
  const [prevLow, lastLow] = swingLows.slice(-2);

  const higherHighs = lastHigh.value > prevHigh.value;
  const higherLows = lastLow.value > prevLow.value;
  const lowerHighs = lastHigh.value < prevHigh.value;
  const lowerLows = lastLow.value < prevLow.value;

  if (higherHighs && higherLows) {
    return {
      label: "ダウ理論",
      value: "高値・安値がともに切り上がっており上昇トレンドが継続中です",
      status: "positive",
    };
  }
  if (lowerHighs && lowerLows) {
    return {
      label: "ダウ理論",
      value: "高値・安値がともに切り下がっており下降トレンドが継続中です",
      status: "negative",
    };
  }
  return {
    label: "ダウ理論",
    value: "高値・安値の切り上げ／切り下げが一致しておらずトレンド転換期の可能性があります",
    status: "neutral",
  };
}
