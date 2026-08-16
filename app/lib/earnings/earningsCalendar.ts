import YahooFinance from "yahoo-finance2";
import { getCachedEarnings, setCachedEarnings } from "./cache";
import type { EarningsInfo } from "./types";

export type { EarningsInfo } from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function toJstDateKey(date: Date): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// Version 1.2: 決算発表日の取得のみを行う。AIスコア・シグナル・EntryBlockの判定条件には
// まだ使用しない（verificationログへの記録とUI上の警告表示のみ）。
// 追加の外部APIキー・依存ライブラリは不要（既存のyahoo-finance2のcalendarEventsモジュールを利用）。
export async function getEarningsInfo(code: string): Promise<EarningsInfo> {
  const cached = getCachedEarnings(code);
  if (cached) return cached;

  try {
    const symbol = `${code}.T`;
    const summary = await yahooFinance.quoteSummary(symbol, { modules: ["calendarEvents"] });
    const dates = summary.calendarEvents?.earnings?.earningsDate ?? [];
    const isEstimate = summary.calendarEvents?.earnings?.isEarningsDateEstimate ?? true;

    const info: EarningsInfo = {
      earningsDate: dates.length > 0 ? toJstDateKey(dates[0]) : null,
      isEstimate,
    };
    return setCachedEarnings(code, info);
  } catch {
    // 新規上場・小型株など決算日が取得できない銘柄でも分析全体を失敗させない
    return setCachedEarnings(code, { earningsDate: null, isEstimate: false });
  }
}

// 判定日と決算発表日の関係を後から再計算できるよう、日数差をそのまま返す。
// 負数=決算前、0=決算当日、正数=決算後。earningsDateがなければnull。
export function calcDaysFromEarnings(judgedAt: string, earningsDate: string | null): number | null {
  if (!earningsDate) return null;
  const judged = new Date(`${judgedAt}T00:00:00+09:00`);
  const earnings = new Date(`${earningsDate}T00:00:00+09:00`);
  const diffMs = judged.getTime() - earnings.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

// UI警告表示・earningsRiskFlag用のしきい値（片側5営業日相当を簡易的に暦日で見る）。
const EARNINGS_RISK_WINDOW_DAYS = 5;

export function isEarningsRisk(daysFromEarnings: number | null): boolean {
  if (daysFromEarnings === null) return false;
  return Math.abs(daysFromEarnings) <= EARNINGS_RISK_WINDOW_DAYS;
}
