"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import Header from "@/app/components/Header";
import FxDecisionCard from "@/app/components/fx/FxDecisionCard";
import FxRegimeSessionCard from "@/app/components/fx/FxRegimeSessionCard";
import FxTimeframeTable from "@/app/components/fx/FxTimeframeTable";
import FxPriceLevelsCard from "@/app/components/fx/FxPriceLevelsCard";
import FxScoreBreakdown from "@/app/components/fx/FxScoreBreakdown";
import FxReasonsList from "@/app/components/fx/FxReasonsList";
import FxCoachComment from "@/app/components/fx/FxCoachComment";
import FxDisclaimer from "@/app/components/fx/FxDisclaimer";
import { getFxPair } from "@/app/lib/fx/config/pairs";
import type { FxAnalysisResult } from "@/app/lib/fx/types";

export default function UsdJpyPage() {
  const [result, setResult] = useState<FxAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pairDef = getFxPair("USDJPY");

  // 初回表示はPromiseチェーンで完結させる（useEffect内でasync関数を直接呼ぶと
  // setStateがエフェクト内で同期的に呼ばれる形になりReactの警告対象になるため、
  // 株式版MarketCard.tsx / DashboardSection.tsxと同じ.then()チェーンの形にそろえている）。
  useEffect(() => {
    fetch("/api/v1/fx/usdjpy")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setResult(data);
      })
      .catch(() => setError("分析中にエラーが発生しました。もう一度お試しください。"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/fx/usdjpy");
      const data = await response.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);
    } catch {
      setError("分析中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/50 ring-1 ring-amber-500/10 sm:p-8">
        <Header />

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-300">{pairDef.displayName} FXトレードコーチ</p>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800/60"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "更新中..." : "更新する"}
          </button>
        </div>

        {isLoading && !result && (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <LoaderCircle size={28} className="animate-spin" />
            分析中...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>
        )}

        {result && (
          <div className="space-y-4">
            <FxDecisionCard result={result} />
            <FxRegimeSessionCard result={result} />
            <FxTimeframeTable multiTimeframe={result.multiTimeframe} />
            <FxPriceLevelsCard
              priceLevels={result.priceLevels}
              riskReward={result.riskReward}
              priceDecimals={pairDef.priceDecimals}
            />
            <FxCoachComment comment={result.coachComment} />
            <FxReasonsList reasons={result.reasons} />
            <FxScoreBreakdown score={result.score} />
            <FxDisclaimer />
          </div>
        )}
      </div>
    </main>
  );
}
