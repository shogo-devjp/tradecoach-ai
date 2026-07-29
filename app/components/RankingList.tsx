import type { LucideIcon } from "lucide-react";
import type { ScreenedStock } from "@/app/lib/screening/types";
import EntryPriorityStars from "./EntryPriorityStars";

type Accent = "emerald" | "rose" | "amber";

const ACCENT_STYLES: Record<Accent, { border: string; bg: string; text: string }> = {
  emerald: { border: "border-emerald-500/20", bg: "bg-emerald-500/5", text: "text-emerald-400" },
  rose: { border: "border-rose-500/20", bg: "bg-rose-500/5", text: "text-rose-400" },
  amber: { border: "border-amber-500/20", bg: "bg-amber-500/5", text: "text-amber-300" },
};

interface RankingListProps {
  title: string;
  icon: LucideIcon;
  accent: Accent;
  items: ScreenedStock[];
  emptyMessage: string;
  showStars?: boolean;
}

export default function RankingList({ title, icon: Icon, accent, items, emptyMessage, showStars }: RankingListProps) {
  const style = ACCENT_STYLES[accent];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Icon size={16} className={style.text} />
        {title}
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={item.code} className={`rounded-xl border ${style.border} ${style.bg} p-3`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-white">
                  {index + 1}. {item.name}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{item.code}</span>
                </span>
                <span className={`tabular-nums text-sm font-bold ${style.text}`}>
                  {item.score}点（信頼度{item.confidence}%）
                </span>
              </div>

              {showStars && (
                <div className="mt-1">
                  <EntryPriorityStars priority={item.entryPriority} />
                </div>
              )}

              <div className="mt-1 tabular-nums text-xs text-slate-400">現在値 {item.price.toLocaleString()}円</div>
              <p className="mt-1.5 text-xs leading-snug text-slate-300">{item.aiComment}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
