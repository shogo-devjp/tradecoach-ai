"use client";

import { useEffect, useState } from "react";
import type { MarketRegime } from "@/app/lib/technicalAnalysis/types";

interface MarketResponse {
  marketRegime: MarketRegime;
  usdJpy: number | null;
}

function changeColor(changePercent: number): string {
  if (changePercent > 0) return "text-emerald-400";
  if (changePercent < 0) return "text-rose-400";
  return "text-slate-300";
}

function formatChangePercent(changePercent: number): string {
  return `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
}

export default function MarketCard() {
  const [data, setData] = useState<MarketResponse | null>(null);

  useEffect(() => {
    fetch("/api/v1/market")
      .then((res) => res.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="mb-6 rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h2 className="mb-4 text-lg font-bold text-white">📊 今日のマーケット</h2>

      {!data && <p className="text-sm text-slate-500">読み込み中...</p>}

      {data && (
        <>
          <div className="space-y-2 text-slate-200">
            <div className="flex justify-between">
              <span>日経平均</span>
              <span className={changeColor(data.marketRegime.nikkei225.changePercent)}>
                {formatChangePercent(data.marketRegime.nikkei225.changePercent)}
              </span>
            </div>

            <div className="flex justify-between">
              <span>TOPIX</span>
              <span className={changeColor(data.marketRegime.topix.changePercent)}>
                {formatChangePercent(data.marketRegime.topix.changePercent)}
              </span>
            </div>

            <div className="flex justify-between">
              <span>USD/JPY</span>
              <span className="text-white">{data.usdJpy ? data.usdJpy.toFixed(2) : "―"}</span>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-400">{data.marketRegime.comment}</p>
        </>
      )}
    </div>
  );
}
