import type { SessionInfo, SessionName } from "../types";

// 各市場の実際の取引時間帯（現地時間ベース）。IANAタイムゾーンでローカル時刻に変換してから
// 判定するため、サマータイム（夏時間）は自動的に考慮される（要件6）。
const SESSION_HOURS: Record<Exclude<SessionName, "OFF_HOURS">, { timeZone: string; startHour: number; endHour: number }> = {
  TOKYO: { timeZone: "Asia/Tokyo", startHour: 9, endHour: 18 },
  LONDON: { timeZone: "Europe/London", startHour: 8, endHour: 17 },
  NEWYORK: { timeZone: "America/New_York", startHour: 8, endHour: 17 },
};

function getLocalHour(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(date);
  // "24"（真夜中を24と表示する実装がある）を0に正規化
  const hour = parseInt(formatted, 10);
  return hour === 24 ? 0 : hour;
}

function isTimeZoneObservingDst(date: Date, timeZone: string): boolean {
  // 1月と7月のUTCオフセットを比較し、現在がどちらと同じかでサマータイム中かを大まかに判定する
  // （表示用途のみで、セッション判定そのものはローカル時刻の時間帯比較で行うため必須ではない）。
  const offsetFor = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(d);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    return tzPart;
  };
  const jan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const jul = new Date(Date.UTC(date.getUTCFullYear(), 6, 1));
  const janOffset = offsetFor(jan);
  const julOffset = offsetFor(jul);
  const currentOffset = offsetFor(date);
  return janOffset !== julOffset && currentOffset === julOffset;
}

export function getSessionInfo(now: Date = new Date()): SessionInfo {
  const activeSessions: SessionName[] = [];

  for (const session of Object.keys(SESSION_HOURS) as Array<keyof typeof SESSION_HOURS>) {
    const { timeZone, startHour, endHour } = SESSION_HOURS[session];
    const localHour = getLocalHour(now, timeZone);
    if (localHour >= startHour && localHour < endHour) {
      activeSessions.push(session);
    }
  }

  const isOverlap = activeSessions.length >= 2;
  const label = buildLabel(activeSessions);
  const isDstAdjusted =
    isTimeZoneObservingDst(now, "Europe/London") || isTimeZoneObservingDst(now, "America/New_York");

  return {
    activeSessions: activeSessions.length > 0 ? activeSessions : ["OFF_HOURS"],
    label,
    isOverlap,
    utcHour: now.getUTCHours(),
    isDstAdjusted,
  };
}

function buildLabel(activeSessions: SessionName[]): string {
  const names: Record<SessionName, string> = {
    TOKYO: "東京時間",
    LONDON: "ロンドン時間",
    NEWYORK: "ニューヨーク時間",
    OFF_HOURS: "オフタイム（主要市場休止中）",
  };

  if (activeSessions.length === 0) return names.OFF_HOURS;
  if (activeSessions.length === 1) return names[activeSessions[0]];

  const hasTokyo = activeSessions.includes("TOKYO");
  const hasLondon = activeSessions.includes("LONDON");
  const hasNY = activeSessions.includes("NEWYORK");

  if (hasTokyo && hasLondon) return "東京・ロンドン重複時間";
  if (hasLondon && hasNY) return "ロンドン・NY重複時間（流動性最大）";
  return activeSessions.map((s) => names[s]).join("・") + "重複";
}
