import type { RiskLevel } from "@/app/lib/technicalAnalysis/types";

// 初心者には★の段階評価より🟢🟡🔴の方が直感的に理解しやすいため、
// リスクレベル（低/中/高）を絵文字バッジに変換して表示する。
const RISK_STYLES: Record<RiskLevel, { emoji: string; label: string; text: string; bg: string }> = {
  低: { emoji: "🟢", label: "安心", text: "text-emerald-300", bg: "bg-emerald-500/10" },
  中: { emoji: "🟡", label: "注意", text: "text-amber-300", bg: "bg-amber-500/10" },
  高: { emoji: "🔴", label: "危険", text: "text-rose-300", bg: "bg-rose-500/10" },
};

export default function RiskBadge({ level }: { level: RiskLevel }) {
  const style = RISK_STYLES[level];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${style.text} ${style.bg}`}
    >
      {style.emoji} {style.label}
    </span>
  );
}
