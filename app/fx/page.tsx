"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import type { FxAnalysisResult } from "@/app/lib/fx/types";
import FxDecisionCard from "@/app/components/fx/FxDecisionCard";
import FxRegimeSessionCard from "@/app/components/fx/FxRegimeSessionCard";
import FxTimeframeRow from "@/app/components/fx/FxTimeframeRow";
import FxPriceLevelsCard from "@/app/components/fx/FxPriceLevelsCard";
import FxAiCoachComment from "@/app/components/fx/FxAiCoachComment";
import FxReasonsList from "@/app/components/fx/FxReasonsList";

async function fetchFxAnalysis(): Promise<{ data: FxAnalysisResult | null; error: string | null }> {
  try {
    const response = await fetch("/api/v1/fx?pair=USDJPY");
    const data = await response.json();
    if (data.error) return { data: null, error: data.error };
    return { data, error: null };
  } catch {
    return { data: null, error: "分析中にエラーが発生しました。もう一度お試しください。" };
  }
}

export default function FxPage() {
  const [analysis, setAnalysis] = useState<FxAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: fetchError } = await fetchFxAnalysis();
    if (fetchError) setError(fetchError);
    else setAnalysis(data);
    setIsLoading(false);
  };

  // 初回マウント時のみ自動取得する。以降の再取得はボタン操作（load）経由にする
  // （エフェクト内でsetStateを同期的に呼ばないよう、.then/.finallyチェーンにまとめている）。
  useEffect(() => {
    let cancelled = false;
    fetchFxAnalysis().then(({ data, error: fetchError }) => {
      if (cancelled) return;
      if (fetchError) setError(fetchError);
      else setAnalysis(data);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/50 ring-1 ring-amber-500/10 sm:p-8">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">💱 TradeCoach AI FX</h1>
            <p className="mt-1 text-sm text-slate-400">USD/JPY トレードコーチ（Phase 1・分析支援専用）</p>
          </div>
          <Link href="/" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
            <ArrowLeft size={14} />
            株式版へ戻る
          </Link>
        </header>

        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          本ツールは相場分析・判断支援のみを目的としています。自動売買・自動発注は一切行いません。売買の最終判断はご自身の責任で行ってください。
        </div>

        <button
          onClick={load}
          disabled={isLoading}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800/60"
        >
          {isLoading ? (
            <>
              <LoaderCircle size={18} className="animate-spin" />
              分析中...
            </>
          ) : (
            <>
              <RefreshCw size={16} />
              最新データで再分析
            </>
          )}
        </button>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">{error}</div>
        )}

        {analysis && (
          <div className="space-y-4">
            <FxDecisionCard pair={analysis.pair} price={analysis.price} decision={analysis.decision} score={analysis.score} />

            <FxRegimeSessionCard marketRegime={analysis.marketRegime} session={analysis.session} />

            <FxTimeframeRow directions={analysis.multiTimeframe.directions} />

            <FxAiCoachComment comment={analysis.aiComment} />

            <FxReasonsList reasons={analysis.decision.reasons} />

            <FxPriceLevelsCard pair={analysis.pair} priceLevels={analysis.priceLevels} riskReward={analysis.riskReward} />

            <p className="text-center text-[11px] text-slate-500">
              最終更新: {new Date(analysis.timestamp).toLocaleString("ja-JP")}（データ提供: Yahoo Finance）
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
