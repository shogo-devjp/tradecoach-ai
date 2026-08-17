import { Scale, ShieldAlert, Target, Wallet } from "lucide-react";
import type { FxPriceLevels, FxRiskReward } from "@/app/lib/fx/types";

function riskRewardColor(ratio: number): string {
  if (ratio >= 2) return "text-emerald-400";
  if (ratio >= 1) return "text-amber-300";
  return "text-rose-400";
}

interface FxPriceLevelsCardProps {
  priceLevels: FxPriceLevels;
  riskReward: FxRiskReward;
  priceDecimals: number;
}

// Entry候補・Stop Loss候補・Take Profit候補・Risk Rewardを表示する（要件9・10）
export default function FxPriceLevelsCard({ priceLevels, riskReward, priceDecimals }: FxPriceLevelsCardProps) {
  const fmt = (value: number) => value.toFixed(priceDecimals);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">エントリー計画</h3>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-center">
        <Wallet size={16} className="mx-auto text-blue-400" />
        <p className="mt-1 text-xs text-slate-400">Entry</p>
        <p className="tabular-nums mt-1 font-bold text-white">
          {fmt(priceLevels.entryLow)} 〜 {fmt(priceLevels.entryHigh)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <ShieldAlert size={16} className="mx-auto text-rose-400" />
          <p className="mt-1 text-xs text-slate-400">Stop Loss</p>
          <p className="tabular-nums mt-1 font-bold text-rose-400">{fmt(priceLevels.stopLoss)}</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Target size={16} className="mx-auto text-emerald-400" />
          <p className="mt-1 text-xs text-slate-400">Take Profit 1</p>
          <p className="tabular-nums mt-1 font-bold text-emerald-400">{fmt(priceLevels.takeProfit1)}</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Target size={16} className="mx-auto text-emerald-400" />
          <p className="mt-1 text-xs text-slate-400">Take Profit 2</p>
          <p className="tabular-nums mt-1 font-bold text-emerald-400">{fmt(priceLevels.takeProfit2)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-center">
        <Scale size={16} className={`mx-auto ${riskRewardColor(riskReward.ratio)}`} />
        <p className="mt-1 text-xs text-slate-400">リスクリワード比</p>
        <p className={`tabular-nums mt-1 font-bold ${riskRewardColor(riskReward.ratio)}`}>
          {riskReward.ratio > 0 ? `1：${riskReward.ratio.toFixed(1)}` : "―"}
        </p>
      </div>
    </div>
  );
}
