import type { EntryBlock, IndicatorRawValues, RiskLevel, Signal, TodayAction } from "@/app/lib/technicalAnalysis/types";

export interface ScreenedStock {
  code: string;
  symbol: string;
  name: string;
  score: number;
  confidence: number;
  price: number;
  signal: Signal;
  entryPriority: number;
  risk: RiskLevel;
  strategyHeadline: string;
  aiComment: string;
  // entryBlockを保持しておくことで、将来「エントリー見送り銘柄は通知しない／注意付きで通知する」
  // といったLINE通知の条件分岐をmessageBuilder側だけの変更で追加できるようにする
  entryBlock: EntryBlock;
  // LINE通知の「今日やること」「理由」表示用
  todayAction: TodayAction;
  todayActionReason: string;
  // 「今日のAIコーチ」通知で銘柄ごとに表示する短い根拠（例：押し目形成・地合い良好）
  reasons: string[];
  // Paper Trading（app/lib/paperTrading）がSignal Snapshotへ転記するために追加。
  // analyzeStockByCode()の戻り値には元々存在していたが、スクリーニング結果には
  // これまで転記されていなかった（表示・通知だけならSL/TPは不要だったため）。
  // 既存の表示・通知ロジックはこの3フィールドを参照しないため、追加による既存挙動への影響はない。
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  // 225銘柄verification（app/lib/universeVerification）がSnapshotへ転記するために追加。
  // 判断の再現・後解析用（RSI/MACD/移動平均等の生値）。表示・通知ロジックは未参照。
  indicatorValues: IndicatorRawValues;
}
