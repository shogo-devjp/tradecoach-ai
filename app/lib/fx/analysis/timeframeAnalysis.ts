import { calculateADX } from "../indicators/adx";
import { calculateATR } from "../indicators/atr";
import { calculateBollingerBands } from "../indicators/bollinger";
import { calculateEMA } from "../indicators/ema";
import { calculateMACD } from "../indicators/macd";
import { calculateMomentum } from "../indicators/momentum";
import { calculateRSI } from "../indicators/rsi";
import { findSupportResistance } from "../indicators/supportResistance";
import type { FxIndicatorReason, FxOHLCSeries, FxTimeframe, TimeframeAnalysis, TimeframeIndicators } from "../types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// 現在値がEMA50からどれだけ％乖離しているかで方向性を連続値化する。
// 0.5%乖離で±1（最大強度）に達する想定（FXは値幅が株式より小さいため株式より小さい基準にしている）。
const FULL_STRENGTH_PERCENT = 0.5;

function scoreFromSpreadPercent(percent: number): number {
  return clamp(percent / FULL_STRENGTH_PERCENT, -1, 1);
}

export function analyzeTimeframe(timeframe: FxTimeframe, series: FxOHLCSeries): TimeframeAnalysis | null {
  const { closes, highs, lows } = series;
  // EMA50・ADX14・ボリンジャー20が安定して計算できる最低本数
  const MIN_POINTS = 60;
  if (closes.length < MIN_POINTS) return null;

  const last = closes.length - 1;
  const currentPrice = closes[last];

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const atr = calculateATR(highs, lows, closes, 14);
  const bb = calculateBollingerBands(closes, 20, 2);
  const adx = calculateADX(highs, lows, closes, 14);
  const momentum = calculateMomentum(closes, 10);
  const { support, resistance } = findSupportResistance(highs, lows, 60);

  const ema20Value = ema20[last];
  const ema50Value = ema50[last];
  const rsiValue = rsi[last];
  const macdLine = macd.macdLine[last];
  const macdSignal = macd.signalLine[last];
  const macdHistogram = macd.histogram[last];
  const atrValue = atr[last];
  const atrPercent = atrValue !== null ? (atrValue / currentPrice) * 100 : null;
  const bbUpper = bb.upper[last];
  const bbLower = bb.lower[last];
  const bbMiddle = bb.middle[last];
  const bbWidthPercent = bb.widthPercent[last];
  const adxValue = adx.adx[last];
  const momentumValue = momentum[last];

  if (ema20Value === null || ema50Value === null) return null;

  const spreadFromEma50Percent = ((currentPrice - ema50Value) / ema50Value) * 100;
  const emaOrderBonus = ema20Value > ema50Value ? 0.2 : ema20Value < ema50Value ? -0.2 : 0;
  const directionScore = clamp(scoreFromSpreadPercent(spreadFromEma50Percent) + emaOrderBonus, -1, 1);

  const direction = directionScore > 0.15 ? "上昇" : directionScore < -0.15 ? "下降" : "横ばい";

  const reasons: FxIndicatorReason[] = [];

  reasons.push({
    label: "EMA",
    value:
      currentPrice > ema20Value && ema20Value > ema50Value
        ? `現在値 > EMA20 > EMA50 で上昇方向です`
        : currentPrice < ema20Value && ema20Value < ema50Value
          ? `現在値 < EMA20 < EMA50 で下降方向です`
          : `EMA20・EMA50が交錯しており方向感が乏しい状態です`,
    status: direction === "上昇" ? "positive" : direction === "下降" ? "negative" : "neutral",
  });

  if (rsiValue !== null) {
    reasons.push({
      label: "RSI",
      value: `RSIは${rsiValue.toFixed(1)}です`,
      status: rsiValue >= 70 ? "negative" : rsiValue <= 30 ? "positive" : "neutral",
    });
  }

  if (macdLine !== null && macdSignal !== null && macdHistogram !== null) {
    const neutralThreshold = currentPrice * 0.0003;
    reasons.push({
      label: "MACD",
      value:
        Math.abs(macdHistogram) <= neutralThreshold
          ? "MACDとシグナルが拮抗しモメンタムに乏しい状態です"
          : macdLine > macdSignal
            ? "MACDがシグナルの上にあり上昇モメンタムです"
            : "MACDがシグナルの下にあり下落モメンタムです",
      status:
        Math.abs(macdHistogram) <= neutralThreshold ? "neutral" : macdLine > macdSignal ? "positive" : "negative",
    });
  }

  if (adxValue !== null) {
    reasons.push({
      label: "ADX",
      value:
        adxValue >= 25
          ? `ADXは${adxValue.toFixed(1)}でトレンドが強く出ています`
          : `ADXは${adxValue.toFixed(1)}でトレンドは弱くレンジ的な値動きです`,
      status: "neutral",
    });
  }

  if (bbWidthPercent !== null && bbUpper !== null && bbLower !== null) {
    const nearUpper = currentPrice >= bbUpper * 0.995;
    const nearLower = currentPrice <= bbLower * 1.005;
    reasons.push({
      label: "ボリンジャーバンド",
      value: nearUpper
        ? "上部バンドに接近しており過熱感があります"
        : nearLower
          ? "下部バンドに接近しており反発の可能性があります"
          : "バンド中央付近で方向感に乏しい状態です",
      status: nearUpper ? "negative" : nearLower ? "positive" : "neutral",
    });
  }

  reasons.push({
    label: "サポート・レジスタンス",
    value: `直近レンジはサポート ${support.toFixed(3)} 〜 レジスタンス ${resistance.toFixed(3)} です`,
    status: "neutral",
  });

  const indicators: TimeframeIndicators = {
    ema20: ema20Value,
    ema50: ema50Value,
    rsi14: rsiValue,
    macdLine,
    macdSignal,
    macdHistogram,
    atr14: atrValue,
    atrPercent,
    bbUpper,
    bbLower,
    bbMiddle,
    bbWidthPercent,
    adx14: adxValue,
    support,
    resistance,
    momentum: momentumValue,
  };

  return {
    timeframe,
    direction,
    directionScore,
    indicators,
    reasons,
    candleClose: currentPrice,
  };
}
