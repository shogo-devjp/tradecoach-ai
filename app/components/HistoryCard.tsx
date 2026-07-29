import { History } from "lucide-react";
import type { HistoryEntry } from "@/app/lib/localStore/history";
import type { Signal } from "@/app/lib/technicalAnalysis/types";

const SIGNAL_COLOR: Record<Signal, string> = {
  買い: "text-emerald-400",
  売り: "text-rose-400",
  待ち: "text-amber-300",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface HistoryCardProps {
  entries: HistoryEntry[];
  onAnalyze: (code: string) => void;
}

export default function HistoryCard({ entries, onAnalyze }: HistoryCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <History size={16} className="text-slate-400" />
        分析履歴（直近{entries.length}件）
      </div>

      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">まだ分析履歴がありません。</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {entries.map((entry, index) => (
            <li key={`${entry.code}-${entry.timestamp}-${index}`}>
              <button
                onClick={() => onAnalyze(entry.code)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-slate-700/50"
              >
                <span className="text-slate-300">
                  {formatDateTime(entry.timestamp)}
                  <span className="font-semibold text-white">{entry.name}</span>
                  <span className="ml-1 text-slate-500">{entry.code}</span>
                </span>
                <span className={`tabular-nums font-semibold ${SIGNAL_COLOR[entry.signal]}`}>
                  {entry.score}点・{entry.signal}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
