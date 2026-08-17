// BUY/SELLスコア計算の重み。後から調整しやすいよう1箇所にまとめる（scoring/score.ts参照）。
// 各要素は-1(売り方向)〜+1(買い方向)に正規化した値を持ち、重み付き合成する
// （単純な足し算ではなく、合意度・地合い・セッションによる補正を掛け合わせる。詳細はscore.tsのコメント参照）。
export const SCORE_FACTOR_WEIGHTS = {
  higherTfTrend: 0.35,
  lowerTfTrend: 0.25,
  momentum: 0.15,
  supportResistance: 0.25,
} as const;

// 相場環境（Market Regime）によって上記の重みをどう補正するか。
// 例：レンジ相場ではサポレジの重要度を上げ、トレンド相場では上位足トレンドの重要度を上げる。
export const REGIME_WEIGHT_MULTIPLIERS: Record<
  string,
  Partial<Record<keyof typeof SCORE_FACTOR_WEIGHTS, number>>
> = {
  TREND_UP: { higherTfTrend: 1.2, supportResistance: 0.8 },
  TREND_DOWN: { higherTfTrend: 1.2, supportResistance: 0.8 },
  RANGE: { higherTfTrend: 0.7, supportResistance: 1.4 },
  HIGH_VOLATILITY: { momentum: 0.7 },
  LOW_VOLATILITY: {},
};

// セッションによるコンフィデンス倍率。流動性が低い時間帯はダマシが増えやすいため
// スコアの信頼度を落とす（東京のみ稼働中など、主要セッションが重ならない時間帯を想定）。
export const SESSION_CONFIDENCE_MULTIPLIER = {
  overlap: 1.0, // ロンドン・NY等の重複時間帯は流動性が高く信頼度そのまま
  singleMajor: 0.9, // ロンドンまたはNYどちらか単独
  tokyoOnly: 0.8, // 東京時間のみ（USD/JPYは動きが小さくなりやすい）
  closed: 0.6, // 主要3市場すべて時間外
} as const;

export const DECISION_THRESHOLDS = {
  // buyScoreがこれ以上でBUY、sellScore(=100-buyScore)がこれ以上でSELL
  buySellThreshold: 65,
  // 高ボラティリティ相場ではエントリー条件を厳しくする（要件5の「高ボラ→厳格化」を反映）
  highVolatilityThreshold: 75,
  // 上位足と下位足の合意度がこれ未満なら方向感不明としてWAITにする
  minAgreement: 0.35,
  // リスクリワード比がこれ未満ならテクニカル条件を満たしていてもWAITにする
  minRiskReward: 1.2,
  // エントリーからストップロスまでの距離がATRの何倍を超えたら「遠すぎる」としてWAITにするか
  maxStopDistanceAtrMultiple: 3,
} as const;
