import type {
  FxDecision,
  FxPairCode,
  FxScoreBreakdownItem,
  MarketRegimeState,
  TimeframeIndicators,
} from "../types";

// 将来のバックテスト・過去検証用のログレコード型（要件20）。
// Phase 1ではDB保存・ファイル保存までは実装せず、型定義のみを用意する
// （analyzeFxPair.tsの戻り値からこの型を組み立てられることを確認済み。
//  永続化が必要になった場合は株式版 app/lib/verification/store.ts と同様に
//  ローカルJSONファイル書き込みの実装を追加すればよい）。
export interface FxAnalysisLogRecord {
  timestamp: string; // ISO8601
  pair: FxPairCode;
  price: number;
  marketRegime: MarketRegimeState;
  buyScore: number;
  sellScore: number;
  decision: FxDecision;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  scoreBreakdown: FxScoreBreakdownItem[];
  // 時間足ごとの指標の生値（後からスコア配点を見直す際の学習データとして使う想定）
  indicatorValuesByTimeframe: Partial<Record<string, TimeframeIndicators>>;
}
