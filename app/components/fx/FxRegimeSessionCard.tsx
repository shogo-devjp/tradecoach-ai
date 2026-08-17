import type { ReactNode } from "react";
import { Activity, Clock, Compass, Gauge, Waves } from "lucide-react";
import type { MarketRegime, SessionInfo } from "@/app/lib/fx/types";

interface FxRegimeSessionCardProps {
  marketRegime: MarketRegime;
  session: SessionInfo;
}

const TREND_LABEL: Record<MarketRegime["trend"], string> = {
  TREND_UP: "上昇トレンド",
  TREND_DOWN: "下降トレンド",
  RANGE: "レンジ",
};

const VOLATILITY_LABEL: Record<MarketRegime["volatility"], string> = {
  HIGH_VOLATILITY: "高ボラティリティ",
  NORMAL_VOLATILITY: "通常ボラティリティ",
  LOW_VOLATILITY: "低ボラティリティ",
};

function Item({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

export default function FxRegimeSessionCard({ marketRegime, session }: FxRegimeSessionCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">相場環境（詳細情報）</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Item icon={<Compass size={14} />} label="Market Regime" value={TREND_LABEL[marketRegime.trend]} />
        <Item icon={<Clock size={14} />} label="Session" value={session.label} />
        <Item icon={<Activity size={14} />} label="Trend (ADX)" value={marketRegime.adx.toFixed(1)} />
        <Item icon={<Gauge size={14} />} label="Volatility" value={VOLATILITY_LABEL[marketRegime.volatility]} />
        <Item icon={<Waves size={14} />} label="ATR%" value={`${marketRegime.atrPercent.toFixed(2)}%`} />
      </div>
    </div>
  );
}
