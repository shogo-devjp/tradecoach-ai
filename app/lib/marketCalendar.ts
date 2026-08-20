// scripts/lib/marketCalendar.mjs（既存の朝夕バッチのスキップ判定・週次レポート判定で
// 使われている休場日判定）と同じロジックを、Next.jsアプリ側（Turbopackバンドル対象）でも
// 使えるようTSへ移植したもの。判定内容（土日・年末年始・祝日）は完全に一致させている。
//
// scripts/配下の.mjsをapp/lib/から直接importせず独立した実装にしているのは、
// スクリプト実行コンテキスト（プレーンなNode ESM）とNext.js/Turbopackのバンドル対象コードとで
// モジュール解決の前提が異なり、越境importを新たに試すこと自体がこの安全監査のスコープを超える
// リスクだと判断したため（過去にprocess.cwd()絡みのビルド挙動で予期しない差異が出た実績があり、
// 慎重を期した）。ロジックが分岐した場合に気づけるよう、両実装のテストは
// 同じ判定内容（土日・年末年始・祝日）であることを明示的に確認する。
//
// 新規に追加した外部依存はない（@holiday-jp/holiday_jpは既存の scripts/lib/marketCalendar.mjs
// が既に使っている、package.jsonの既存依存をそのまま再利用している）。
import holidayJp from "@holiday-jp/holiday_jp";

export interface JstDateParts {
  year: number;
  month: number;
  day: number;
  weekday: string; // "Mon" | "Tue" | ... （Intl.DateTimeFormatの短縮英語表記）
}

export function getJstDateParts(date: Date = new Date()): JstDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: parts.weekday };
}

function isWeekend({ weekday }: JstDateParts): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

function isYearEndNewYear({ month, day }: JstDateParts): boolean {
  return (month === 12 && day === 31) || (month === 1 && day <= 3);
}

function isNationalHoliday({ year, month, day }: JstDateParts): boolean {
  return holidayJp.isHoliday(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

export function getClosedReasons(parts: JstDateParts): string[] {
  const reasons: string[] = [];
  if (isWeekend(parts)) reasons.push("weekend");
  if (isYearEndNewYear(parts)) reasons.push("year-end/new-year");
  if (isNationalHoliday(parts)) reasons.push("national holiday");
  return reasons;
}

// JST基準で、その日がJPXの営業日（土日・年末年始・祝日のいずれでもない）かどうか。
export function isTradingDayJst(date: Date = new Date()): boolean {
  const parts = getJstDateParts(date);
  return getClosedReasons(parts).length === 0;
}

// "HH:MM"形式（JST）。既存signalSnapshotStore.tsのnowHhmmJst()と同じtoLocaleTimeString方式にし、
// 文字列比較で時刻の前後判定ができるようにする。
export function jstHHMM(date: Date = new Date()): string {
  return date.toLocaleTimeString("sv-SE", { timeZone: "Asia/Tokyo", hour12: false }).slice(0, 5);
}

// "YYYY-MM-DD"形式（JST）。既存の各所のtodayKeyJst()と同じ方式。
export function jstDateKey(date: Date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}
