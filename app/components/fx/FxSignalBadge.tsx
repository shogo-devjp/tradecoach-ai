import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { FxSignal } from "@/app/lib/fx/types";

// 株式版のSignalBadgeとは意図的に別コンポーネントにする（要件16のエンジン分離方針をUI側にも適用）。
// labelは判定値（FxSignal）そのままではなく、断定を避ける表示専用の文言にする
// （TradeCoach AIは売買を断定しない判断支援ツールという方針のため）。
const SIGNAL_STYLES: Record<
  FxSignal,
  { text: string; bg: string; border: string; Icon: typeof TrendingUp; label: string }
> = {
  買い: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", Icon: TrendingUp, label: "買い候補" },
  売り: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/40", Icon: TrendingDown, label: "売り候補" },
  待ち: { text: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40", Icon: Minus, label: "様子見中" },
};

export default function FxSignalBadge({ signal, size = "md" }: { signal: FxSignal; size?: "md" | "lg" }) {
  const style = SIGNAL_STYLES[signal];
  const Icon = style.Icon;
  const sizeClass = size === "lg" ? "px-5 py-2 text-2xl" : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-bold ${style.text} ${style.bg} ${style.border} ${sizeClass}`}
    >
      <Icon size={size === "lg" ? 24 : 16} />
      {style.label}
    </span>
  );
}
