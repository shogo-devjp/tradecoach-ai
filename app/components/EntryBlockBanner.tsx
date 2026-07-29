import { OctagonAlert, TriangleAlert } from "lucide-react";
import type { EntryBlockLevel } from "@/app/lib/technicalAnalysis/types";

type BlockingLevel = Exclude<EntryBlockLevel, "none">;

const STYLES: Record<
  BlockingLevel,
  { border: string; bg: string; text: string; Icon: typeof OctagonAlert; title: string }
> = {
  blocked: {
    border: "border-rose-500/50",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    Icon: OctagonAlert,
    title: "本日はエントリー見送りを推奨",
  },
  caution: {
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    Icon: TriangleAlert,
    title: "注意：エントリーは慎重に",
  },
};

interface EntryBlockBannerProps {
  level: BlockingLevel;
  reason: string | null;
}

export default function EntryBlockBanner({ level, reason }: EntryBlockBannerProps) {
  const style = STYLES[level];
  const Icon = style.Icon;

  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} p-4`}>
      <div className={`flex items-center gap-2 text-sm font-bold ${style.text}`}>
        <Icon size={18} />
        {style.title}
      </div>
      {reason && <p className="mt-2 text-sm leading-relaxed text-slate-100/90">{reason}</p>}
    </div>
  );
}
