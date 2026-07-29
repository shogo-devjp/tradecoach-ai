import type { Signal, StrategyAction } from "@/app/lib/technicalAnalysis/types";

export interface HistoryEntry {
  code: string;
  name: string;
  score: number;
  signal: Signal;
  confidence: number;
  strategyAction: StrategyAction;
  timestamp: string;
}

const STORAGE_KEY = "tradecoach:history";
const MAX_ENTRIES = 20;

type Listener = () => void;
const listeners = new Set<Listener>();

// useSyncExternalStore用にキャッシュした参照を保持する（watchlist.tsと同じ理由）。
let cachedSnapshot: HistoryEntry[] | null = null;

function readFromStorage(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeToStorage(entries: HistoryEntry[]): HistoryEntry[] {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  cachedSnapshot = entries;
  listeners.forEach((listener) => listener());
  return entries;
}

export function getHistorySnapshot(): HistoryEntry[] {
  if (cachedSnapshot === null) {
    cachedSnapshot = readFromStorage();
  }
  return cachedSnapshot;
}

export function getHistoryServerSnapshot(): HistoryEntry[] {
  return [];
}

export function subscribeHistory(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const updated = [entry, ...getHistorySnapshot()].slice(0, MAX_ENTRIES);
  return writeToStorage(updated);
}

export function findPreviousEntry(history: HistoryEntry[], code: string): HistoryEntry | undefined {
  return history.find((entry) => entry.code === code);
}

export interface AnalysisDiff {
  previousTimestamp: string;
  scoreDelta: number;
  confidenceDelta: number;
  previousStrategyAction: StrategyAction;
  currentStrategyAction: StrategyAction;
  strategyChanged: boolean;
}

export function computeDiff(previous: HistoryEntry, current: HistoryEntry): AnalysisDiff {
  return {
    previousTimestamp: previous.timestamp,
    scoreDelta: current.score - previous.score,
    confidenceDelta: current.confidence - previous.confidence,
    previousStrategyAction: previous.strategyAction,
    currentStrategyAction: current.strategyAction,
    strategyChanged: previous.strategyAction !== current.strategyAction,
  };
}
