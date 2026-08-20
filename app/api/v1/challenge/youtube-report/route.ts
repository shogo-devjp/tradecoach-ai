import { NextResponse } from "next/server";
import { buildYoutubeReport } from "@/app/lib/challenge/youtubeReport";
import { apiError } from "@/app/lib/api/response";

// 読み取り専用。GET /api/v1/challenge/youtube-report?from=YYYY-MM-DD&to=YYYY-MM-DD
// 既に確定しているDaily Record（Paper Trading本体のSSOTをそのまま転記したもの）の
// 単純な集計のみを行う。書き込みは一切行わない。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "from・toの両方をYYYY-MM-DD形式で指定してください" }, { status: 400 });
  }

  try {
    const report = await buildYoutubeReport(from, to);
    return NextResponse.json(report);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
