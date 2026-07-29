import type { EntryBlock, RiskLevel, Signal, TodayAction } from "@/app/lib/technicalAnalysis/types";

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
}
