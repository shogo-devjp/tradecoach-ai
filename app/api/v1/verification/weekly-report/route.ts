import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getVerificationLog } from "@/app/lib/verification/store";
import { generateWeeklyReportMarkdown } from "@/app/lib/verification/weeklyReport";
import { apiError } from "@/app/lib/api/response";

const REPORTS_DIR = path.join(process.cwd(), "reports/weekly");

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// Version 1.3: 週次検証レポートの生成専用エンドポイント。読み取り専用のverificationログを
// 集計してMarkdownを書き出すだけで、AIスコア・シグナル判定・EntryBlock・TOP3抽出条件には
// 一切書き込みを行わない（読むだけ）。呼び出しは scripts/run-evening-settle.sh から
// 週の最終営業日のみ行われる想定だが、このAPI自体は何度呼んでも同じ週のファイルを
// 上書きするだけで安全（副作用は reports/weekly/ 配下のファイル書き込みのみ）。
export async function POST() {
  try {
    const records = await getVerificationLog();
    const { markdown, meta } = generateWeeklyReportMarkdown(records, todayKey());

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    const fileName = `${meta.weekKey}.md`;
    const filePath = path.join(REPORTS_DIR, fileName);
    await fs.writeFile(filePath, markdown, "utf-8");

    return NextResponse.json({
      path: `reports/weekly/${fileName}`,
      weekKey: meta.weekKey,
      mondayKey: meta.mondayKey,
      fridayKey: meta.fridayKey,
    });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
