"use client";

import { useEffect, useState } from "react";
import { Flame, RefreshCw, TrendingDown, Trophy } from "lucide-react";
import type { ScreenedStock } from "@/app/lib/screening/types";
import RankingList from "./RankingList";
import Disclaimer from "./Disclaimer";

const THRESHOLDS = [70, 80, 90] as const;

interface ScanResponse {
  hasRunToday: boolean;
  scannedAt?: string;
  scannedCount?: number;
  failedCount?: number;
  buySignals: ScreenedStock[];
  sellSignals: ScreenedStock[];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardSection() {
  const [minScore, setMinScore] = useState<number>(80);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/screening/signals?minScore=${minScore}`)
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleThresholdChange = async (value: number) => {
    setMinScore(value);
    if (!data?.hasRunToday) return;

    const res = await fetch(`/api/v1/screening/signals?minScore=${value}`);
    setData(await res.json());
  };

  const runScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch(`/api/v1/screening/signals?minScore=${minScore}`, { method: "POST" });
      setData(await res.json());
    } catch {
      alert("シグナルの取得中にエラーが発生しました。時間をおいて再度お試しください。");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Flame size={18} className="text-orange-400" />
          今日のダッシュボード
        </div>

        <button
          onClick={runScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800/60"
        >
          <RefreshCw size={14} className={isScanning ? "animate-spin" : ""} />
          {isScanning ? "スキャン中..." : "更新する"}
        </button>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {THRESHOLDS.map((threshold) => (
          <button
            key={threshold}
            onClick={() => handleThresholdChange(threshold)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              minScore === threshold
                ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/50"
                : "bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
          >
            買い{threshold}点以上
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {data?.hasRunToday
          ? `最終更新：${formatTime(data.scannedAt!)}${
              data.scannedCount ? `（${data.scannedCount}銘柄中` : ""
            }${data.failedCount ? `・${data.failedCount}件失敗）` : data.scannedCount ? "）" : ""}`
          : "まだ本日の分析は実行されていません。「更新する」を押してください。"}
      </p>

      <div className="mt-4 space-y-5">
        <RankingList
          title="今日のおすすめ TOP5"
          icon={Trophy}
          accent="amber"
          items={data?.buySignals.slice(0, 5) ?? []}
          showStars
          emptyMessage="おすすめ銘柄はまだありません。"
        />

        <RankingList
          title="買いランキング"
          icon={Flame}
          accent="emerald"
          items={data?.buySignals ?? []}
          emptyMessage="条件に合う買いシグナルはありませんでした。"
        />

        <RankingList
          title="売り注意ランキング"
          icon={TrendingDown}
          accent="rose"
          items={data?.sellSignals ?? []}
          emptyMessage="売り注意の銘柄はありませんでした。"
        />
      </div>

      <div className="mt-4">
        <Disclaimer />
      </div>
    </div>
  );
}
