import { NextResponse } from "next/server";
import { readEvents } from "@/app/lib/challenge/store";
import { apiError } from "@/app/lib/api/response";

// 読み取り専用。?limit=で直近N件（省略時は全件、occurredAt昇順）。
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit"));
    const events = await readEvents();
    const result = Number.isFinite(limit) && limit > 0 ? events.slice(-limit) : events;
    return NextResponse.json({ count: result.length, events: result });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
