"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import VerificationStats from "@/app/components/VerificationStats";
import type { AggregateStats } from "@/app/lib/verification/aggregate";

export default function VerificationPage() {
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/verification")
      .then((res) => res.json())
      .then((data) => setStats(data.stats))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/50 ring-1 ring-amber-500/10 sm:p-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft size={16} />
          ダッシュボードに戻る
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-white">検証ダッシュボード</h1>
        <p className="mb-6 text-sm text-slate-400">
          これまでのAI判定と実際の値動きを自動集計しています。今後のスコア配点調整の材料に使います。
        </p>

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400">
            <LoaderCircle size={20} className="animate-spin" />
            集計中...
          </div>
        )}

        {!isLoading && stats && stats.totalRecords === 0 && (
          <p className="text-sm text-slate-400">まだ記録がありません。銘柄を分析すると自動的に記録されます。</p>
        )}

        {!isLoading && stats && stats.totalRecords > 0 && <VerificationStats stats={stats} />}
      </div>
    </main>
  );
}
