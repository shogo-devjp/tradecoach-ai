import type { NotificationEvent, Notifier } from "./types";
import { getDefaultNotifier } from "./defaultNotifier";

// スクリーニング結果を通知処理に渡すだけの合成関数。
// screening側はNotifierの存在を一切知らないため、通知手段の追加・変更はここだけで完結する。
export async function dispatchNotifications(
  event: NotificationEvent,
  notifier: Notifier = getDefaultNotifier()
): Promise<void> {
  await notifier.notify(event);
}
