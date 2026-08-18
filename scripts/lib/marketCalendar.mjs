// JPX（日本取引所グループ）の営業日判定・週次判定の共通ロジック。
// check-market-open.mjs（休場日スキップ）と is-last-trading-day-of-week.mjs（週次レポート生成タイミング）
// の両方から利用する。ロジックは元々 check-market-open.mjs にあったものをそのまま切り出しただけで、
// 判定内容（土日・年末年始・祝日の扱い）は一切変更していない。
import holidayJp from "@holiday-jp/holiday_jp";

export function getJstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: parts.weekday };
}

function isWeekend({ weekday }) {
  return weekday === "Sat" || weekday === "Sun";
}

function isYearEndNewYear({ month, day }) {
  return (month === 12 && day === 31) || (month === 1 && day <= 3);
}

function isNationalHoliday({ year, month, day }) {
  return holidayJp.isHoliday(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

export function getClosedReasons(parts) {
  const reasons = [];
  if (isWeekend(parts)) reasons.push("weekend");
  if (isYearEndNewYear(parts)) reasons.push("year-end/new-year");
  if (isNationalHoliday(parts)) reasons.push("national holiday");
  return reasons;
}

export function isTradingDay(parts) {
  return !isWeekend(parts) && !isYearEndNewYear(parts) && !isNationalHoliday(parts);
}

function addDaysJst(parts, n) {
  // JST正午基準でn日進めてから、日付要素を再取得する（DST等はないが念のため正午基準にして安全側にする）
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 3, 0, 0)); // 12:00 JST = 03:00 UTC
  base.setUTCDate(base.getUTCDate() + n);
  return getJstDateParts(base);
}

function isoWeekKey({ year, month, day }) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (d.getUTCDay() + 6) % 7; // 月=0 ... 日=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // その週の木曜日
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fdDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fdDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getIsoWeekKey(parts) {
  return isoWeekKey(parts);
}

// 「今日が今週最後の営業日か」を判定する。
// 翌日以降を1日ずつ調べ、次に見つかった営業日が別のISO週であれば、今日が今週最後の営業日。
// 祝日で金曜が休みの週は木曜が「最後の営業日」として正しく判定される。
export function isLastTradingDayOfWeek(parts = getJstDateParts()) {
  if (!isTradingDay(parts)) return false;
  const thisWeek = isoWeekKey(parts);
  for (let i = 1; i <= 7; i++) {
    const next = addDaysJst(parts, i);
    if (isTradingDay(next)) {
      return isoWeekKey(next) !== thisWeek;
    }
  }
  return true;
}
