import { Scale, ShieldAlert, Target, Wallet } from "lucide-react";
import type { RiskLevel } from "@/app/lib/technicalAnalysis/types";
import { PRICE_LEVEL_LABEL } from "@/app/lib/technicalAnalysis/displayLabels";
import RiskBadge from "./RiskBadge";

interface PriceLevelsCardProps {
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  riskReward: number;
  riskLevel: RiskLevel;
}

function riskRewardColor(riskReward: number): string {
  if (riskReward >= 2) return "text-emerald-400";
  if (riskReward >= 1) return "text-amber-300";
  return "text-rose-400";
}

// 初心者向けに「エントリー計画」として4項目（注目価格帯・上値目安・リスク管理の参考価格・
// リスクリワード比）に絞って表示する。ATRは詳しい分析セクション側の指標カードに任せる。
export default function PriceLevelsCard({
  entryPrice,
  takeProfit,
  stopLoss,
  riskReward,
  riskLevel,
}: PriceLevelsCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">エントリー計画</h3>
        <RiskBadge level={riskLevel} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
          <Wallet size={16} className="mx-auto text-blue-400" />
          <p className="mt-1 text-xs text-slate-400">{PRICE_LEVEL_LABEL.entry}</p>
          <p className="tabular-nums mt-1 font-bold text-white">{entryPrice.toLocaleString()}円</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Target size={16} className="mx-auto text-emerald-400" />
          <p className="mt-1 text-xs text-slate-400">{PRICE_LEVEL_LABEL.takeProfit}</p>
          <p className="tabular-nums mt-1 font-bold text-emerald-400">{takeProfit.toLocaleString()}円</p>
        </div>

        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
          <ShieldAlert size={16} className="mx-auto text-rose-400" />
          <p className="mt-1 text-xs text-slate-400">{PRICE_LEVEL_LABEL.stopLoss}</p>
          <p className="tabular-nums mt-1 font-bold text-rose-400">{stopLoss.toLocaleString()}円</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-center">
        <Scale size={16} className={`mx-auto ${riskRewardColor(riskReward)}`} />
        <p className="mt-1 text-xs text-slate-400">リスクリワード比</p>
        <p className={`tabular-nums mt-1 font-bold ${riskRewardColor(riskReward)}`}>{riskReward.toFixed(1)}倍</p>
      </div>
    </div>
  );
}
