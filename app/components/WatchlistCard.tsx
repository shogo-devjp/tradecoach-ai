import { Search, Star, Trash2 } from "lucide-react";
import type { WatchlistItem } from "@/app/lib/localStore/watchlist";

interface WatchlistCardProps {
  items: WatchlistItem[];
  onAnalyze: (code: string) => void;
  onRemove: (code: string) => void;
}

export default function WatchlistCard({ items, onAnalyze, onRemove }: WatchlistCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Star size={16} className="text-amber-300" />
        ウォッチリスト
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          まだ登録されていません。分析結果から「ウォッチリストに追加」で登録できます。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.code}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3"
            >
              <span className="text-sm font-semibold text-white">
                {item.name}
                <span className="ml-1.5 text-xs font-normal text-slate-400">{item.code}</span>
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAnalyze(item.code)}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  <Search size={12} />
                  分析
                </button>
                <button
                  onClick={() => onRemove(item.code)}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:text-rose-400"
                  aria-label="ウォッチリストから削除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
