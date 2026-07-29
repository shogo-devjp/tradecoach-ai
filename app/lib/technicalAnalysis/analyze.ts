import { calculateATR, describeATR } from "./indicators/atr";
import { calculateMACD, describeMACD } from "./indicators/macd";
import { calculateRSI, describeRSI } from "./indicators/rsi";
import { calculateSMA, describeSingleMA } from "./indicators/sma";
import { findSupportResistance } from "./indicators/supportResistance";
import { analyzeVolume } from "./indicators/volume";
import { calculatePriceLevels } from "./priceLevels";
import { calculateScore, STATUS_POINTS } from "./score";
import { generateComment } from "./comment";
import { buildReasons } from "./reasons";
import { determineTrend } from "./trend";
import { determineSentiment } from "./sentiment";
import { assessRisk } from "./risk";
import { calculateEntryPriority } from "./entryPriority";
import { buildTodayStrategy } from "./strategy";
import { generateCoachComment } from "./coach";
import { assessDowTheory } from "./dowTheory";
import { calculateRiskReward } from "./riskReward";
import { assessEntryBlock } from "./entryBlock";
import { determineIntradayTrend } from "./intraday";
import { determineEntryTiming, calculateEntryTimingScore, determineTodayAction, buildTodayActionReason } from "./entryTiming";
import type { AnalysisResult, IndicatorReason, MarketRegime, OHLCVSeries, VolumeReason } from "./types";

// SMA75・MACD(12,26,9)・RSI14が安定して計算でき、かつ前日比較ができる最低本数
const MIN_DATA_POINTS = 80;

export interface AnalysisContext {
  marketRegime: MarketRegime;
  // includeIntraday:false（一括スクリーニング等）の場合はnullを渡す。
  // その場合エントリータイミング判定は日足・地合いのみで簡易的に行う。
  intraday: { closes60m: number[]; closes15m: number[] } | null;
}

// ATRの点数化は「低ボラティリティ＝リスク管理しやすい＝高得点」という表示専用の換算であり、
// スコア計算式そのものには使わない（risk.tsの閾値と同じ基準を流用）。
function atrToPoints(atrPercent: number): number {
  if (atrPercent < 2) return 10;
  if (atrPercent < 4) return 5;
  return 0;
}

export function runTechnicalAnalysis(series: OHLCVSeries, context: AnalysisContext): AnalysisResult {
  const { closes, highs, lows, volumes } = series;
  const { marketRegime, intraday } = context;

  if (closes.length < MIN_DATA_POINTS) {
    return buildInsufficientDataResult(closes[closes.length - 1] ?? 0, marketRegime);
  }

  const sma5 = calculateSMA(closes, 5);
  const sma25 = calculateSMA(closes, 25);
  const sma75 = calculateSMA(closes, 75);
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const atr = calculateATR(highs, lows, closes, 14);

  const last = closes.length - 1;
  const currentPrice = closes[last];
  const atrValue = atr[last] ?? currentPrice * 0.02;
  const atrPercent = (atrValue / currentPrice) * 100;

  // MIN_DATA_POINTS により以下の値は必ず計算済み（non-null）であることが保証されている
  const ma5Reason = describeSingleMA("5日", currentPrice, sma5[last]!);
  const ma25Reason = describeSingleMA("25日", currentPrice, sma25[last]!);
  const ma75Reason = describeSingleMA("75日", currentPrice, sma75[last]!);
  const macdReason = describeMACD(
    macd.macdLine[last]!,
    macd.signalLine[last]!,
    macd.macdLine[last - 1]!,
    macd.signalLine[last - 1]!,
    currentPrice
  );
  const rsiReason = describeRSI(rsi[last]!);
  const volumeReason = analyzeVolume(volumes);
  const { support, resistance, reason: srReason } = findSupportResistance(highs, lows, currentPrice);
  const { trend, reason: trendReason } = determineTrend(currentPrice, sma25[last]!, sma75[last]!);
  const dowTheoryReason = assessDowTheory(highs, lows);
  const atrReason = describeATR(atrValue, atrPercent);

  // 総合スコアはRSI・MACD・5日/25日/75日移動平均線・ダウ理論の6指標で判定する
  // （トレンド・サポレジ・ATRは参考表示カードとしては残すが、スコアには使わない）
  const { score, signal, confidence, breakdown } = calculateScore({
    rsiReason,
    macdReason,
    ma5Reason,
    ma25Reason,
    ma75Reason,
    dowTheoryReason,
    volumeReason,
  });

  const { entryPrice, takeProfit, stopLoss } = calculatePriceLevels(
    currentPrice,
    support,
    resistance,
    atrValue,
    signal
  );
  const riskReward = calculateRiskReward(entryPrice, takeProfit, stopLoss);

  const indicators = {
    movingAverage5: ma5Reason,
    movingAverage25: ma25Reason,
    movingAverage75: ma75Reason,
    macd: macdReason,
    rsi: rsiReason,
    volume: volumeReason,
    supportResistance: srReason,
    trend: trendReason,
    dowTheory: dowTheoryReason,
    atr: atrReason,
  };
  // 根拠一覧はスコア計算に使った6指標＋出来高（補強材料）のみを対象にする
  const reasons = buildReasons(signal, {
    movingAverage5: ma5Reason,
    movingAverage25: ma25Reason,
    movingAverage75: ma75Reason,
    macd: macdReason,
    rsi: rsiReason,
    dowTheory: dowTheoryReason,
    volume: volumeReason,
  });

  // スコア内訳の表示は「実際にスコア計算へ使っている6指標」に加え、出来高（ブースターとして
  // 実際にスコアへ影響する）とATR（純粋にボラティリティの参考情報でスコアには使わない）を追加した8項目とする。
  const scoreBreakdown = [
    ...breakdown,
    { label: volumeReason.label, points: STATUS_POINTS[volumeReason.status], status: volumeReason.status, contributesToScore: true },
    { label: atrReason.label, points: atrToPoints(atrPercent), status: atrReason.status, contributesToScore: false },
  ];

  const { sentiment } = determineSentiment(trendReason, macdReason, rsi[last]!);
  const risk = assessRisk(atrValue, currentPrice, rsi[last]!, confidence);
  const entryBlock = assessEntryBlock({
    signal,
    riskLevel: risk.level,
    confidence,
    atrPercent,
    riskReward,
    marketCondition: marketRegime.overall,
    dowTheoryStatus: dowTheoryReason.status,
  });

  const trend60m = intraday ? determineIntradayTrend(intraday.closes60m) : null;
  const trend15m = intraday ? determineIntradayTrend(intraday.closes15m) : null;
  const distanceToResistancePercent = ((resistance - currentPrice) / currentPrice) * 100;

  const timingInputs = {
    signal,
    dailyTrend: trend,
    trend60m,
    trend15m,
    distanceToResistancePercent,
    marketCondition: marketRegime.overall,
    riskLevel: risk.level,
  };
  const entryTiming = determineEntryTiming(timingInputs);
  const entryTimingScore = calculateEntryTimingScore(timingInputs, entryTiming);
  const todayAction = determineTodayAction(entryBlock.level, entryTiming);
  const todayActionReason = buildTodayActionReason(todayAction, {
    ...timingInputs,
    support,
    resistance,
    entryBlockReason: entryBlock.reason,
  });

  const aiComment = generateComment({
    signal,
    trend,
    confidence,
    rsiValue: rsi[last]!,
    reasons,
    entryPrice,
    takeProfit,
    stopLoss,
    riskReward,
    atrPercent,
    entryBlockLevel: entryBlock.level,
    entryBlockReason: entryBlock.reason,
    entryTiming,
    support,
    resistance,
    marketCondition: marketRegime.overall,
  });

  const entryPriority = calculateEntryPriority(score, confidence, risk.level);
  const strategy = buildTodayStrategy(signal, trend, risk.level, rsi[last]!);
  const coachComment = generateCoachComment(signal, trend, risk.level, rsi[last]!, sentiment);

  return {
    score,
    signal,
    confidence,
    trend,
    entryPrice,
    takeProfit,
    stopLoss,
    aiComment,
    reasons,
    sentiment,
    risk,
    entryPriority,
    strategy,
    coachComment,
    atrValue,
    atrPercent,
    riskReward,
    entryBlock,
    scoreBreakdown,
    marketRegime,
    entryTiming,
    entryTimingScore,
    todayAction,
    todayActionReason,
    indicators,
  };
}

function buildInsufficientDataResult(currentPrice: number, marketRegime: MarketRegime): AnalysisResult {
  const insufficient: IndicatorReason = {
    label: "データ不足",
    value: "分析に必要な過去データが不足しています",
    status: "neutral",
  };
  const insufficientVolume: VolumeReason = { ...insufficient, ratio: 1 };

  return {
    score: 50,
    signal: "待ち",
    confidence: 0,
    trend: "横ばい",
    entryPrice: currentPrice,
    takeProfit: currentPrice,
    stopLoss: currentPrice,
    aiComment:
      "上場から日が浅いなど過去データが不足しているため、十分な分析ができません。しばらく値動きを確認してから判断することをおすすめします。",
    reasons: ["過去データが不足しているため十分な根拠を提示できません"],
    sentiment: "様子見",
    risk: { level: "中", reason: "過去データが不足しているためリスクを正確に評価できません。" },
    entryPriority: 1,
    strategy: {
      action: "待機",
      headline: "データ不足のため本日は待機を推奨します",
      description: "十分な過去データが揃ってから改めて分析することをおすすめします。",
    },
    coachComment:
      "「焦って買わない方がいい理由」：判断材料となる過去データがまだ十分ではありません。データが蓄積されるまでは無理に売買せず、値動きを観察する期間と捉えましょう。",
    atrValue: 0,
    atrPercent: 0,
    riskReward: 0,
    entryBlock: { level: "blocked", reason: "過去データが不足しているため本日は判定できません。" },
    scoreBreakdown: [
      { label: "RSI", points: 5, status: "neutral", contributesToScore: true },
      { label: "MACD", points: 5, status: "neutral", contributesToScore: true },
      { label: "5日移動平均線", points: 5, status: "neutral", contributesToScore: true },
      { label: "25日移動平均線", points: 5, status: "neutral", contributesToScore: true },
      { label: "75日移動平均線", points: 5, status: "neutral", contributesToScore: true },
      { label: "ダウ理論", points: 5, status: "neutral", contributesToScore: true },
      { label: "出来高", points: 5, status: "neutral", contributesToScore: true },
      { label: "ATR", points: 5, status: "neutral", contributesToScore: false },
    ],
    marketRegime,
    entryTiming: "様子見",
    entryTimingScore: 3,
    todayAction: "見送り",
    todayActionReason: "過去データが不足しているため本日は判定できません。無理をせず見送りましょう。",
    indicators: {
      movingAverage5: insufficient,
      movingAverage25: insufficient,
      movingAverage75: insufficient,
      macd: insufficient,
      rsi: insufficient,
      volume: insufficientVolume,
      supportResistance: { ...insufficient, support: currentPrice, resistance: currentPrice },
      trend: insufficient,
      dowTheory: insufficient,
      atr: insufficient,
    },
  };
}
