import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

// LINE Developersコンソールの「Webhook URL」に設定するエンドポイント。
// 現時点ではイベントを検証してログに残すだけのプレースホルダー実装（consoleNotifierと同じ思想）。
// 将来ここで follow イベントの userId を保存すれば、ウォッチリスト通知等の
// ユーザーごとのpush配信（lineClient.push）に使える宛先が手に入る。
function verifySignature(body: string, signatureHeader: string | null): boolean {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret || !signatureHeader) return false;

  const expected = createHmac("sha256", channelSecret).update(body).digest("base64");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as { events?: Array<{ type: string; source?: unknown }> };

  for (const event of payload.events ?? []) {
    console.log(`[line webhook] event: ${event.type}`, event.source);
  }

  return NextResponse.json({ status: "ok" });
}
