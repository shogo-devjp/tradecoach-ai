export interface WatchlistItem {
  code: string;
  name: string;
  addedAt: string;
}

const STORAGE_KEY = "tradecoach:watchlist";

type Listener = () => void;
const listeners = new Set<Listener>();

// useSyncExternalStore用にキャッシュした参照を保持する。
// JSON.parseは呼ぶたびに新しい配列を返すため、変更が無い限り同じ参照を返さないと
// useSyncExternalStoreが無限に再レンダリングを起こしてしまう。
let cachedSnapshot: WatchlistItem[] | null = null;

function readFromStorage(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeToStorage(items: WatchlistItem[]): WatchlistItem[] {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  cachedSnapshot = items;
  listeners.forEach((listener) => listener());
  return items;
}

export function getWatchlistSnapshot(): WatchlistItem[] {
  if (cachedSnapshot === null) {
    cachedSnapshot = readFromStorage();
  }
  return cachedSnapshot;
}

export function getWatchlistServerSnapshot(): WatchlistItem[] {
  return [];
}

export function subscribeWatchlist(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addToWatchlist(item: { code: string; name: string }): WatchlistItem[] {
  const current = getWatchlistSnapshot();
  if (current.some((entry) => entry.code === item.code)) return current;

  return writeToStorage([{ ...item, addedAt: new Date().toISOString() }, ...current]);
}

export function removeFromWatchlist(code: string): WatchlistItem[] {
  return writeToStorage(getWatchlistSnapshot().filter((entry) => entry.code !== code));
}
