import type { Notifier } from "./types";
import { buildNotificationMessages } from "./messageBuilder";

// LINE等の実チャネルを設定していない開発時のデフォルト実装。
// lineNotifierと同じ messageBuilder を使うため、通知内容はコンソールで
// そのまま確認できる（実チャネルなしで動作確認できるようにする狙い）。
export const consoleNotifier: Notifier = {
  async notify(event) {
    const messages = buildNotificationMessages(event);
    if (messages.length === 0) return;

    console.log(`[notifications] ${event.type} を${messages.length}件配信`);
    messages.forEach((message) => console.log(message));
  },
};
