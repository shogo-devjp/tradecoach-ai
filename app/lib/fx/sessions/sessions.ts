import type { FxSessionName, FxSessionState } from "../types";

// 各市場の「現地時間」での営業時間帯（証券会社等が一般的に使う目安の時間帯）。
// IANAタイムゾーンDB（Intl.DateTimeFormat）で現地時間に変換してから判定するため、
// サマータイム（ロンドン=BST、ニューヨーク=EDT）は自動的に考慮される
// （日本にはサマータイムがないため東京時間は年間を通じて同じ判定になる）。
const SESSION_HOURS: Record<FxSessionName, { timeZone: string; startHour: number; endHour: number }> = {
  TOKYO: { timeZone: "Asia/Tokyo", startHour: 9, endHour: 18 },
  LONDON: { timeZone: "Europe/London", startHour: 8, endHour: 17 },
  NEW_YORK: { timeZone: "America/New_York", startHour: 8, endHour: 17 },
};

export const SESSION_LABEL: Record<FxSessionName, string> = {
  TOKYO: "東京時間",
  LONDON: "ロンドン時間",
  NEW_YORK: "ニューヨーク時間",
};

function getHourInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "numeric",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return hourPart ? Number(hourPart.value) : 0;
}

function isActive(date: Date, session: FxSessionName): boolean {
  const { timeZone, startHour, endHour } = SESSION_HOURS[session];
  const hour = getHourInZone(date, timeZone);
  return hour >= startHour && hour < endHour;
}

// バックテスト可能な設計（要件19）のため、判定基準となる時刻は引数として明示的に受け取る
// （Date.now()を内部で呼ばない。呼び出し側がanalyzeFxPair実行時に渡す）。
export function determineFxSession(now: Date): FxSessionState {
  const activeSessions = (Object.keys(SESSION_HOURS) as FxSessionName[]).filter((session) =>
    isActive(now, session)
  );

  const hasTokyo = activeSessions.includes("TOKYO");
  const hasLondon = activeSessions.includes("LONDON");
  const hasNewYork = activeSessions.includes("NEW_YORK");

  let overlap: FxSessionState["overlap"] = null;
  if (hasLondon && hasNewYork) overlap = "LONDON_NEW_YORK";
  else if (hasTokyo && hasLondon) overlap = "TOKYO_LONDON";

  let comment: string;
  if (overlap === "LONDON_NEW_YORK") {
    comment = "ロンドン・ニューヨークの重複時間帯で、1日の中でも流動性が最も高く値動きが大きくなりやすい時間帯です。";
  } else if (overlap === "TOKYO_LONDON") {
    comment = "東京・ロンドンの重複時間帯です。値動きが徐々に活発になり始める時間帯です。";
  } else if (activeSessions.length === 0) {
    comment = "主要3市場（東京・ロンドン・ニューヨーク）がすべて時間外です。値動きが薄くなりやすい時間帯です。";
  } else {
    comment = `${activeSessions.map((s) => SESSION_LABEL[s]).join("・")}のみが稼働中です。`;
  }

  return { activeSessions, overlap, comment };
}
