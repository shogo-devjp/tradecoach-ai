import type { ScreenedStock } from "./types";

interface CachedScan {
  dateKey: string;
  scannedAt: string;
  scannedCount: number;
  failedCount: number;
  candidates: ScreenedStock[];
  // その日の「今日の注目銘柄」通知をすでに送信済みかどうか。
  // force=true による再スキャンが同日中に何度呼ばれても通知が重複しないようにする
  // （スキャン自体のキャッシュと、通知済みかどうかは別の関心事のため分離している）。
  notified: boolean;
}

// プロセスメモリ上のキャッシュ（サーバー再起動で消える）。
// 本番運用では複数インスタンス・再起動をまたいで共有できるDB/KVストアに置き換えること。
let cache: CachedScan | null = null;

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function getCachedScan(): CachedScan | null {
  if (cache && cache.dateKey === todayKey()) return cache;
  return null;
}

export function setCachedScan(
  candidates: ScreenedStock[],
  scannedCount: number,
  failedCount: number
): CachedScan {
  cache = {
    dateKey: todayKey(),
    scannedAt: new Date().toISOString(),
    scannedCount,
    failedCount,
    candidates,
    notified: false,
  };
  return cache;
}

// 通知を送信し終えたことを記録する。当日のキャッシュが存在する場合のみ有効。
export function markScanNotified(): void {
  if (cache && cache.dateKey === todayKey()) {
    cache.notified = true;
  }
}
