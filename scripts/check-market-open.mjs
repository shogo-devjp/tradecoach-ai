#!/usr/bin/env node
// 日本株市場（JPX）が本日営業日かどうかを判定する。
// run-morning-signal.sh から呼ばれ、終了コードで結果を返す：
//   0 = 営業日（実行してよい）
//   1 = 休場日（土日・年末年始・祝日のいずれか。スキップすべき）
// 休場理由はstderrに出力する（呼び出し側でログに残せるように）。
import holidayJp from "@holiday-jp/holiday_jp";

function getJstDateParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday, // "Sun" | "Mon" | ... | "Sat"
  };
}

const { year, month, day, weekday } = getJstDateParts();

const isWeekend = weekday === "Sat" || weekday === "Sun";
// JPXは12/31〜1/3を年末年始休場とする（国民の祝日ではないが証券取引所が休みの日）
const isYearEndNewYear = (month === 12 && day === 31) || (month === 1 && day <= 3);
// holiday_jpは時刻を見ないため、UTC正午に固定して構築すれば日付ズレの心配がない
const isNationalHoliday = holidayJp.isHoliday(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));

if (isWeekend || isYearEndNewYear || isNationalHoliday) {
  const reasons = [];
  if (isWeekend) reasons.push("weekend");
  if (isYearEndNewYear) reasons.push("year-end/new-year");
  if (isNationalHoliday) reasons.push("national holiday");
  console.error(`market closed (${reasons.join(", ")})`);
  process.exit(1);
}

process.exit(0);
