const LINE_API_BASE = "https://api.line.me/v2/bot/message";

// LINE Messaging APIへの実HTTP呼び出しをインターフェース化したもの。
// lineNotifier はこのインターフェースにのみ依存するため、テスト時は
// 実際にLINEへ発呼しないフェイク実装に差し替えられる。
export interface LineMessagingClient {
  broadcast(messages: string[]): Promise<void>;
  push(userId: string, messages: string[]): Promise<void>;
}

function toTextMessages(messages: string[]) {
  return messages.map((text) => ({ type: "text", text }));
}

function getAccessToken(): string {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
  }
  return accessToken;
}

async function postToLine(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${LINE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`LINE Messaging API failed (${response.status}): ${await response.text()}`);
  }
}

export const httpLineClient: LineMessagingClient = {
  // 公式アカウントの友だち全員に配信する（宛先を選べないぶん、今は買い/売りシグナルの
  // 全体通知向け。ユーザーごとの配信が必要になったら push() を使う）
  async broadcast(messages) {
    await postToLine("/broadcast", { messages: toTextMessages(messages) });
  },

  async push(userId, messages) {
    await postToLine("/push", { to: userId, messages: toTextMessages(messages) });
  },
};
