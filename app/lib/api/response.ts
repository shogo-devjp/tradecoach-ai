import { NextResponse } from "next/server";

// 将来ネイティブアプリ等の外部クライアントが依存するエラー形状を1箇所に集約する。
export function apiError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}
