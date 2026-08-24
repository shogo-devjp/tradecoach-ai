import type { ScreenedStock } from "@/app/lib/screening/types";
import type { Signal } from "@/app/lib/technicalAnalysis/types";
import type { ChallengeDailyRecord } from "@/app/lib/challenge/types";
import type { EveningOrchestrationStep } from "@/app/lib/challenge/eveningOrchestrationStore";

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
//
// challenge_daily_result / challenge_evening_error（AI資産運用50万円チャレンジ）:
// いずれも「確定済みデータを読んで伝えるだけ」のイベントであり、このNotificationEvent自体が
// 売買判定・損益計算を行うことはない。ChallengeDailyRecordはPaper Trading本体の確定値を
// そのまま転記したものであり、通知はさらにそれをそのままメッセージ化するだけ（app/lib/challenge/
// dailyResultNotifier.ts参照）。
export type NotificationEvent =
  | { type: "todays_picks"; candidates: ScreenedStock[] }
  | { type: "watchlist_signal_change"; changes: WatchlistSignalChange[] }
  | { type: "challenge_daily_result"; record: ChallengeDailyRecord }
  | { type: "challenge_evening_error"; date: string; failedStep: EveningOrchestrationStep | null; errorReason: string | null };

export interface Notifier {
  notify(event: NotificationEvent): Promise<void>;
}
