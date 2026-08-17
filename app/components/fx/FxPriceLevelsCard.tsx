import { Scale, ShieldAlert, Target, Wallet } from "lucide-react";
import type { CurrencyPairConfig, FxPriceLevels, RiskRewardResult } from "@/app/lib/fx/types";

interface FxPriceLevelsCardProps {
  pair: CurrencyPairConfig;
  priceLevels: FxPriceLevels;
  riskReward: RiskRewardResult;
}

function riskRewardColor(ratio: number, isAcceptable: boolean): string {
  if (!isAcceptable) return "text-rose-400";
  if (ratio >= 2) return "text-emerald-400";
  return "text-amber-300";
}

export default function FxPriceLevelsCard({ pair, priceLevels, riskReward }: FxPriceLevelsCardProps) {
  const fmt = (v: number) => v.toFixed(pair.priceDecimals);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">エントリープラン</h3>

      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-center">
        <Wallet size={16} className="mx-auto text-blue-400" />
        <p className="mt-1 text-xs text-slate-400">Entry</p>
        <p className="tabular-nums mt-1 font-bold text-white">
          {fmt(Math.min(priceLevels.entryLow, priceLevels.entryHigh))}〜{fmt(Math.max(priceLevels.entryLow, priceLevels.entryHigh))}
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
        <Scale size={16} className={`mx-auto ${riskRewardColor(riskReward.ratio, riskReward.isAcceptable)}`} />
        <p className="mt-1 text-xs text-slate-400">Risk Reward Ratio</p>
        <p className={`tabular-nums mt-1 font-bold ${riskRewardColor(riskReward.ratio, riskReward.isAcceptable)}`}>
          1 : {riskReward.ratio.toFixed(1)}
        </p>
        {!riskReward.isAcceptable && (
          <p className="mt-1 text-[11px] text-rose-400">リスクリワードが基準未満のため判定に影響しています</p>
        )}
      </div>
    </div>
  );
}
