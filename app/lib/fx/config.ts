import type { ScoreWeights, TimeframeWeights } from "./types";

// FX分析エンジンの全設定を1箇所に集約する。要件8「各要素のウェイトはconfig化して、
// 後から変更可能にする」に対応。売買判定ロジック自体は変えずに、この値だけをチューニングして
// 挙動を調整できるようにするのが狙い。

// --- マルチタイムフレームの重み付け ---
// 「日足→大きな方向、4時間足→中期トレンド、1時間足→現在のトレンド、
//  15分足→エントリー候補、5分足→エントリータイミング」という考え方（要件3）に基づき、
// 上位足ほど重みを大きくする。これはマルチタイムフレーム分析における一般的な設計
// （上位足の方向に逆らわない＝トレンドフォローの精度が上がりやすい）を踏襲したもので、
// 短期足は「上位足の方向に沿ったタイミング取り」の役割に限定する。
export const TIMEFRAME_WEIGHTS: TimeframeWeights = {
  "1d": 0.30,
  "4h": 0.25,
  "1h": 0.20,
  "15m": 0.15,
  "5m": 0.10,
};

// --- BUY/SELLスコアのウェイト ---
// 「各テクニカル指標を単純に足し算するだけ」にしない（要件8）ため、指標そのものではなく
// 「上位足トレンド」「下位足トレンド」「モメンタム」等の意味的なブロック単位でウェイトを持たせる。
export const SCORE_WEIGHTS: ScoreWeights = {
  higherTimeframeTrend: 0.30, // 1d + 4h の方向感（トレンドフォローの土台）
  lowerTimeframeTrend: 0.15, // 1h + 15m + 5m の方向感（エントリータイミング）
  momentum: 0.20, // RSI・MACD・ADXの勢い
  supportResistance: 0.15, // 直近サポート・レジスタンスとの位置関係
  volatility: 0.10, // ATR・ボリンジャーバンド幅の適正さ
  marketRegime: 0.05, // 相場環境（トレンド/レンジ）との整合性
  session: 0.05, // セッション（流動性）ボーナス
};

// --- 相場環境判定の閾値 ---
export const REGIME_CONFIG = {
  // ADXがこの値以上ならトレンド相場、未満ならレンジ相場とみなす（一般的な目安）
  adxTrendThreshold: 22,
  // 4h ATR%（現在値に対する割合）の閾値。これを超えると高ボラティリティ、下回ると低ボラティリティ。
  // USD/JPYの平時のボラティリティ水準を踏まえた目安値。
  highVolatilityAtrPercent: 0.55,
  lowVolatilityAtrPercent: 0.20,
};

// --- 売買判定（WAIT優先）の閾値 ---
export const DECISION_CONFIG = {
  // スコアがこれ以上ならBUY/SELL候補、未満はWAIT
  minScoreForSignal: 60,
  // BUYスコアとSELLスコアの差がこれ未満なら「拮抗＝方向感なし」としてWAIT
  minScoreGap: 12,
  // RSIがこれ以上/以下だと「過熱」とみなし、新規順張りエントリーを控える
  overboughtRsi: 75,
  oversoldRsi: 25,
  // リスクリワードがこれ未満ならテクニカル的にBUY/SELL条件でもWAITにする（要件10）
  minRiskReward: 1.3,
  // Entryから損切りまでの距離がATRの何倍を超えたら「遠すぎる」とみなすか
  maxStopDistanceAtrMultiple: 2.5,
  // 主要サポート・レジスタンスの「中間」とみなす範囲（レンジ幅に対する割合）
  midRangeBandPercent: 0.35,
};

// --- 価格レベル（Entry/StopLoss/TakeProfit）計算の設定 ---
export const PRICE_LEVELS_CONFIG = {
  stopLossAtrMultiple: 1.2,
  takeProfit1AtrMultiple: 1.8,
  takeProfit2AtrMultiple: 3.0,
  // Entryゾーンの幅（ATR倍率）
  entryZoneAtrMultiple: 0.3,
};

export const FX_CONFIG = {
  timeframeWeights: TIMEFRAME_WEIGHTS,
  scoreWeights: SCORE_WEIGHTS,
  regime: REGIME_CONFIG,
  decision: DECISION_CONFIG,
  priceLevels: PRICE_LEVELS_CONFIG,
};

export type FxConfig = typeof FX_CONFIG;
