import type { ScreenedStock } from "@/app/lib/screening/types";
import type { Signal } from "@/app/lib/technicalAnalysis/types";

export interface WatchlistSignalChange {
  code: string;
  name: string;
  previousSignal: Signal;
  currentSignal: Signal;
  previousScore: number;
  currentScore: number;
}

// TradeCoach AIは「全部の銘柄を知らせる」のではなく「今日見るべき銘柄だけを教える」方針のため、
// 通知は1日1通・買い候補上位3件までの"todays_picks"のみとする（買い/売りシグナルの個別配信は廃止）。
export type NotificationEvent =
  | { type: "todays_picks"; candidates: ScreenedStock[] }
  | { type: "watchlist_signal_change"; changes: WatchlistSignalChange[] };

export interface Notifier {
  notify(event: NotificationEvent): Promise<void>;
}
