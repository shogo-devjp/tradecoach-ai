import type { Notifier } from "./types";
import type { LineMessagingClient } from "./lineClient";
import { httpLineClient } from "./lineClient";
import { buildNotificationMessages } from "./messageBuilder";

// LINE公式アカウントの友だち全員に配信するNotifier実装。
// 実際のHTTP送信（LineMessagingClient）を差し替え可能にすることで、
// メッセージ生成のテストが本物のLINE APIに依存しないようにしている。
export function createLineNotifier(client: LineMessagingClient = httpLineClient): Notifier {
  return {
    async notify(event) {
      const messages = buildNotificationMessages(event);
      if (messages.length === 0) return;
      await client.broadcast(messages);
    },
  };
}

export const lineNotifier = createLineNotifier();
