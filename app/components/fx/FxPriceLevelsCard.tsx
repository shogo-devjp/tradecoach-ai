import { Scale, ShieldAlert, Target, Wallet } from "lucide-react";
import type { CurrencyPairConfig, FxPriceLevels, FxSignal, RiskRewardResult } from "@/app/lib/fx/types";

interface FxPriceLevelsCardProps {
  pair: CurrencyPairConfig;
  priceLevels: FxPriceLevels;
  riskReward: RiskRewardResult;
  signal: FxSignal;
  // RRの目安値。ハードコードせずFX_CONFIG.decision.minRiskReward（app/lib/fx/config.ts）を
  // page.tsx経由で渡してもらう。
  minRiskReward: number;
}

function riskRewardColor(ratio: number, isAcceptable: boolean): string {
  if (!isAcceptable) return "text-rose-400";
  if (ratio >= 2) return "text-emerald-400";
  return "text-amber-300";
}

// 画面の優先順位4番目「条件が揃った場合のエントリープラン」。
// WAIT時: モノトーン表示＋デフォルト折りたたみ＋「まだ有効なプランではない」旨を明記し、
//         誤って「今すぐ入っていい価格」と誤解されないようにする。
// BUY/SELL時: 方向（買い/売り）が色で視覚的に分かるようにしつつ、「エントリー候補として
//         検討できる」という非断定的な位置付けの文言にとどめる。
export default function FxPriceLevelsCard({ pair, priceLevels, riskReward, signal, minRiskReward }: FxPriceLevelsCardProps) {
  const fmt = (v: number) => v.toFixed(pair.priceDecimals);
  const isWait = signal === "待ち";
  const isBuy = signal === "買い";

  const entryBorderTone = isWait ? "border-slate-600 bg-slate-900/60" : isBuy ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5";
  const entryIconTone = isWait ? "text-slate-400" : isBuy ? "text-emerald-400" : "text-rose-400";
  const entryValueTone = isWait ? "text-slate-300" : isBuy ? "text-emerald-300" : "text-rose-300";
  const slBorderTone = isWait ? "border-slate-600 bg-slate-900/60" : "border-rose-500/30 bg-rose-500/5";
  const tpBorderTone = isWait ? "border-slate-600 bg-slate-900/60" : "border-emerald-500/30 bg-emerald-500/5";

  const content = (
    <>
      <p className={`mb-3 text-xs ${isWait ? "text-amber-300" : "text-slate-400"}`}>
        {isWait
          ? "※これは参考プランです。まだ有効なエントリープランではありません。"
          : "条件が揃っているため、エントリー候補として検討できます（最終判断はご自身で行ってください）。"}
      </p>

      <div className={`rounded-xl border p-3 text-center ${entryBorderTone}`}>
        <Wallet size={16} className={`mx-auto ${entryIconTone}`} />
        <p className="mt-1 text-xs text-slate-400">Entry</p>
        <p className={`tabular-nums mt-1 font-bold ${entryValueTone}`}>
          {fmt(Math.min(priceLevels.entryLow, priceLevels.entryHigh))}〜{fmt(Math.max(priceLevels.entryLow, priceLevels.entryHigh))}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className={`rounded-xl border p-3 ${slBorderTone}`}>
          <ShieldAlert size={16} className={`mx-auto ${isWait ? "text-slate-400" : "text-rose-400"}`} />
          <p className="mt-1 text-xs text-slate-400">Stop Loss</p>
          <p className={`tabular-nums mt-1 font-bold ${isWait ? "text-slate-300" : "text-rose-400"}`}>{fmt(priceLevels.stopLoss)}</p>
        </div>
        <div className={`rounded-xl border p-3 ${tpBorderTone}`}>
          <Target size={16} className={`mx-auto ${isWait ? "text-slate-400" : "text-emerald-400"}`} />
          <p className="mt-1 text-xs text-slate-400">Take Profit 1</p>
          <p className={`tabular-nums mt-1 font-bold ${isWait ? "text-slate-300" : "text-emerald-400"}`}>{fmt(priceLevels.takeProfit1)}</p>
        </div>
        <div className={`rounded-xl border p-3 ${tpBorderTone}`}>
          <Target size={16} className={`mx-auto ${isWait ? "text-slate-400" : "text-emerald-400"}`} />
          <p className="mt-1 text-xs text-slate-400">Take Profit 2</p>
          <p className={`tabular-nums mt-1 font-bold ${isWait ? "text-slate-300" : "text-emerald-400"}`}>{fmt(priceLevels.takeProfit2)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-center">
        <Scale size={16} className={`mx-auto ${riskRewardColor(riskReward.ratio, riskReward.isAcceptable)}`} />
        <p className="mt-1 text-xs text-slate-400">Risk Reward Ratio</p>
        <p className={`tabular-nums mt-1 font-bold ${riskRewardColor(riskReward.ratio, riskReward.isAcceptable)}`}>
          現在 1:{riskReward.ratio.toFixed(1)} ／ 目安 1:{minRiskReward.toFixed(1)}以上
        </p>
        {!riskReward.isAcceptable && (
          <p className="mt-1 text-[11px] text-rose-400">→ リターンに対してリスクが大きいため見送り</p>
        )}
      </div>
    </>
  );

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-300">エントリープラン{isWait ? "（参考）" : ""}</h3>

      {isWait ? (
        <details className="group">
          <summary className="cursor-pointer list-none rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 marker:content-none">
            <span className="inline-flex items-center gap-2">
              参考プランを見る（条件が揃った場合の想定）
              <span className="text-slate-500 transition-transform group-open:rotate-180">▼</span>
            </span>
          </summary>
          <div className="mt-3">{content}</div>
        </details>
      ) : (
        content
      )}
    </div>
  );
}
