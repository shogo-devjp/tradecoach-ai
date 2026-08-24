import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { jstDateKey } from "@/app/lib/marketCalendar";
import { getDailyRecord } from "./store";
import { getEveningOrchestrationRecord } from "./eveningOrchestrationStore";
import { dispatchNotifications } from "@/app/lib/notifications/dispatchNotifications";
import { notifyOnceToday } from "@/app/lib/notifications/dailyNotifiedStore";
import type { Notifier } from "@/app/lib/notifications/types";

// ============================================================================
// AI資産運用50万円チャレンジ・夕方結果のLINE通知（読み取り専用の通知レイヤー）
// ============================================================================
//
// 重要な設計原則（ユーザー要求）:
//   ・「運用処理」と「通知処理」は完全に分離する。このモジュールは
//     ChallengeDailyRecord / EveningOrchestrationRecord を「読むだけ」で、
//     Paper Trading・Universe Verification・Strategy A・Snapshotのいずれにも一切書き込まない。
//   ・LINE通知に失敗しても、Paper Trading本体・Daily Record・Verification等の
//     正常終了済み処理をロールバックしない（このモジュール自体がそれらを一切変更しないため、
//     構造的にロールバックする対象が存在しない）。
//   ・evening orchestration自体が失敗した日は正常結果通知を送らない。
//   ・同一 strategyId + date + notificationType について正常結果通知は1回だけ
//     （notifyOnceToday()のkind引数で "challenge-evening-result-{strategyId}" として分離、
//     朝のtodays_picks通知（kind="default"）とは完全に独立したマーカーを使う）。
//
// エラー通知（夕方オーケストレーション自体の失敗）は別kind
// "challenge-evening-error-{strategyId}" で同様に1日1回に冪等化する。

export type NotifyDailyResultOutcome =
  | "sent_result" // 正常結果通知を新規送信した
  | "sent_error" // エラー通知を新規送信した
  | "already_notified" // 今日は既に送信済み（同種の通知）だったためスキップした
  | "skipped_non_trading_day" // evening orchestration自体が非営業日・時間外でスキップした日
  | "skipped_not_ready" // evening orchestrationの記録がまだ無い／Daily Recordがまだ無い
  | "send_failed"; // 通知の送信自体が失敗した（LINE APIエラー等）。確定データには一切影響しない

export interface NotifyDailyResultResult {
  date: string;
  outcome: NotifyDailyResultOutcome;
  detail?: string;
}

export interface NotifyChallengeDailyResultInput {
  date?: string;
  strategyId?: string;
  now?: Date;
  // テスト用の依存注入。省略時はNOTIFIER_CHANNEL環境変数によるデフォルト実装
  // （console/line）を使う（既存のgetDefaultNotifier()と同じ切り替え方式）。
  notifier?: Notifier;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function notifyChallengeDailyResult(
  input: NotifyChallengeDailyResultInput = {}
): Promise<NotifyDailyResultResult> {
  const now = input.now ?? new Date();
  const strategyId = input.strategyId ?? STRATEGY_A_ID;
  const date = input.date ?? jstDateKey(now);

  const orchestrationRecord = await getEveningOrchestrationRecord(date);

  // evening orchestrationがまだこの日付を一度も処理していない（レコード自体が存在しない）。
  // 通知処理が運用処理を先回りしてはいけないため、何もしない。
  if (!orchestrationRecord) {
    return { date, outcome: "skipped_not_ready", detail: "evening_orchestration_record_not_found" };
  }

  // 非営業日・時間外ガードでevening orchestration自体が何も実行しなかった日は通知しない
  // （「取引がなかった」のか「システムが動かなかった」のかを区別する目的自体が非営業日には
  // 適用されないため、ユーザー要求どおり非営業日は通知そのものを送らない）。
  if (orchestrationRecord.skipReason) {
    return { date, outcome: "skipped_non_trading_day", detail: orchestrationRecord.skipReason };
  }

  const succeeded = orchestrationRecord.successStep === "milestones" && orchestrationRecord.failedStep === null;

  if (succeeded) {
    const record = await getDailyRecord(date);
    if (!record) {
      // 想定外（successStep=milestonesならDaily Recordは存在するはず）。安全側に倒して何もしない。
      return { date, outcome: "skipped_not_ready", detail: "daily_record_not_found" };
    }
    try {
      const sent = await notifyOnceToday(
        () => dispatchNotifications({ type: "challenge_daily_result", record }, input.notifier),
        `challenge-evening-result-${strategyId}`,
        now
      );
      return { date, outcome: sent ? "sent_result" : "already_notified" };
    } catch (error) {
      // LINE送信失敗時はマーカーを作らない（notifyOnceToday内部の仕様）ため次回リトライ可能。
      // Paper Trading・Daily Record等の確定データには一切触れていないため、ここで例外を
      // 握りつぶしても運用処理側には何の影響も無い。
      console.error("[challenge] 夕方結果のLINE通知に失敗しました（確定データへの影響はありません）:", error);
      return { date, outcome: "send_failed", detail: errorMessage(error) };
    }
  }

  // ここに到達するのは failedStep が設定されている場合のみ
  // （succeeded=falseかつskipReasonなし＝実行を試みて途中で失敗した）。
  if (orchestrationRecord.failedStep) {
    try {
      const sent = await notifyOnceToday(
        () =>
          dispatchNotifications(
            {
              type: "challenge_evening_error",
              date,
              failedStep: orchestrationRecord.failedStep,
              errorReason: orchestrationRecord.errorReason,
            },
            input.notifier
          ),
        `challenge-evening-error-${strategyId}`,
        now
      );
      return { date, outcome: sent ? "sent_error" : "already_notified" };
    } catch (error) {
      console.error("[challenge] 夕方エラーのLINE通知に失敗しました:", error);
      return { date, outcome: "send_failed", detail: errorMessage(error) };
    }
  }

  // successStepもfailedStepも未設定（理論上到達しないはずだが、念のため安全側に倒す）。
  return { date, outcome: "skipped_not_ready", detail: "orchestration_incomplete" };
}
