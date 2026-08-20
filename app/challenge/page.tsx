"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, TrendingDown, TrendingUp } from "lucide-react";
import type { ChallengeDailyRecord, ChallengeDailyTradeEntry, ChallengeEvent, ChallengeMeta } from "@/app/lib/challenge/types";

interface EquityPoint {
  date: string;
  totalAssets: number;
  benchmarkValue: number;
  cumulativeReturnPercent: number;
  benchmarkCumulativeReturnPercent: number;
}

interface DashboardData {
  meta: ChallengeMeta | null;
  latest: ChallengeDailyRecord | null;
  recentTrades: ChallengeDailyTradeEntry[];
  recentEvents: ChallengeEvent[];
  equitySeries: EquityPoint[];
}

const yen = (v: number) => `¥${Math.round(v).toLocaleString("ja-JP")}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function ReturnBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}>
      {positive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
      {pct(value)}
    </span>
  );
}

// 資産推移・Benchmark比較の簡易SVGスパークライン（外部ライブラリ非依存、YouTube画面収録用の
// 素材としてそのまま使える程度の見やすさを目標にする）。
function EquityChart({ series }: { series: EquityPoint[] }) {
  if (series.length < 2) {
    return <div className="flex h-48 items-center justify-center text-sm text-slate-500">データ蓄積中（2営業日分以上でグラフ表示）</div>;
  }
  const width = 640;
  const height = 200;
  const pad = 8;
  const allValues = series.flatMap((p) => [p.cumulativeReturnPercent, p.benchmarkCumulativeReturnPercent]);
  const min = Math.min(0, ...allValues);
  const max = Math.max(0, ...allValues);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (series.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);
  const zeroY = y(0);

  const tcPath = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cumulativeReturnPercent).toFixed(1)}`).join(" ");
  const bmPath = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.benchmarkCumulativeReturnPercent).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full">
      <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} stroke="#334155" strokeWidth={1} strokeDasharray="4 4" />
      <path d={bmPath} fill="none" stroke="#64748b" strokeWidth={2} />
      <path d={tcPath} fill="none" stroke="#f59e0b" strokeWidth={2.5} />
    </svg>
  );
}

export default function ChallengePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/challenge/dashboard")
      .then((res) => res.json())
      .then((d) => setData(d))
      .finally(() => setIsLoading(false));
  }, []);

  const latest = data?.latest ?? null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black px-4 py-10">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/50 ring-1 ring-amber-500/10 sm:p-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
          <ArrowLeft size={16} />
          ダッシュボードに戻る
        </Link>

        <h1 className="mb-1 text-2xl font-bold text-white">AI資産運用50万円チャレンジ</h1>
        <p className="mb-6 text-sm text-slate-400">
          TradeCoach AIのBUY/SELL/WAIT判断のみで仮想500,000円を運用した記録（Paper Trading）
        </p>

        {isLoading && (
          <div className="flex items-center gap-2 text-slate-400">
            <LoaderCircle size={20} className="animate-spin" />
            読み込み中...
          </div>
        )}

        {!isLoading && !latest && (
          <p className="text-sm text-slate-400">
            まだDaily Recordがありません。Challenge本稼働開始・Paper Trading日次runの後に自動生成されます。
          </p>
        )}

        {!isLoading && latest && (
          <div className="space-y-4">
            {/* --- ヒーロー数字 --- */}
            <div className="rounded-2xl border border-amber-500/20 bg-slate-800 p-6 text-center">
              <div className="text-xs font-semibold tracking-wide text-slate-400 uppercase">運用{latest.tradingDayNumber}営業日目</div>
              <div className="mt-3 flex items-center justify-center gap-3 text-slate-300">
                <span className="text-lg tabular-nums text-slate-400">{yen(latest.initialCapital)}</span>
                <span className="text-slate-500">→</span>
                <span className="text-4xl font-extrabold tabular-nums text-white sm:text-5xl">{yen(latest.totalAssets)}</span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-4 text-sm">
                <span className="text-slate-400">
                  累計損益 <span className={`font-bold tabular-nums ${latest.cumulativePnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{yen(latest.cumulativePnl)}</span>
                </span>
                <ReturnBadge value={latest.cumulativeReturnPercent} />
              </div>
            </div>

            {/* --- 指標グリッド --- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="日経225同期比" value={pct(latest.excessReturnPercentagePoints)} highlight={latest.excessReturnPercentagePoints >= 0} />
              <StatCard label="最大Drawdown" value={`${latest.maxDrawdownPercent.toFixed(1)}%`} />
              <StatCard label="勝率" value={latest.winRatePercent === null ? "―" : `${latest.winRatePercent.toFixed(1)}%`} />
              <StatCard label="総取引数" value={`${latest.winCount + latest.lossCount}件`} />
              <StatCard label="現在保有銘柄" value={`${latest.openPositionCount}銘柄`} />
              <StatCard label="日経225 累計Return" value={pct(latest.benchmarkCumulativeReturnPercent)} />
              <StatCard label="Profit Factor" value={latest.profitFactor === null ? "―" : latest.profitFactor.toFixed(2)} />
              <StatCard label="Strategy Version" value={latest.strategyVersion} small />
            </div>

            {/* --- グラフ --- */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-300">
                <span>TradeCoach vs 日経225（累計Return%）</span>
                <span className="flex items-center gap-3 text-xs font-normal text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-3 bg-amber-500" />
                    TradeCoach
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-3 bg-slate-500" />
                    日経225
                  </span>
                </span>
              </div>
              <EquityChart series={data!.equitySeries} />
            </div>

            {/* --- 最近の取引 --- */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">最近の取引</h3>
              {data!.recentTrades.length === 0 && <p className="text-xs text-slate-500">まだ取引はありません</p>}
              <div className="space-y-1.5">
                {data!.recentTrades
                  .slice()
                  .reverse()
                  .map((t, i) => (
                    <div key={`${t.positionId}-${t.side}-${i}`} className="flex items-center justify-between border-b border-slate-700 py-1.5 text-sm last:border-0">
                      <span className="text-slate-300">
                        {t.code} {t.companyName}
                        <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${t.side === "ENTRY" ? "bg-blue-900 text-blue-300" : "bg-slate-700 text-slate-300"}`}>
                          {t.side === "ENTRY" ? "買い" : "決済"}
                        </span>
                      </span>
                      <span className="tabular-nums text-slate-400">
                        {t.side === "EXIT" && t.realizedPnl !== null ? (
                          <span className={t.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>{yen(t.realizedPnl)}</span>
                        ) : (
                          `${t.shares}株 @${t.entryPrice}`
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* --- 最近の重要イベント --- */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
              <h3 className="mb-2 text-sm font-semibold text-slate-300">最近の重要イベント</h3>
              {data!.recentEvents.length === 0 && <p className="text-xs text-slate-500">まだイベントはありません</p>}
              <div className="space-y-1.5">
                {data!.recentEvents.map((e) => (
                  <div key={e.eventId} className="flex items-center justify-between border-b border-slate-700 py-1.5 text-sm last:border-0">
                    <span className="text-slate-300">{eventLabel(e.eventType)}</span>
                    <span className="text-xs text-slate-500">運用{e.tradingDayNumber}日目</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value, highlight, small }: { label: string; value: string; highlight?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-center">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-1 tabular-nums font-bold ${small ? "text-xs text-slate-300" : "text-lg"} ${highlight === undefined ? "text-white" : highlight ? "text-emerald-400" : "text-rose-400"}`}>
        {value}
      </div>
    </div>
  );
}

function eventLabel(type: ChallengeEvent["eventType"]): string {
  const labels: Record<ChallengeEvent["eventType"], string> = {
    challenge_started: "チャレンジ開始",
    first_entry: "初エントリー",
    first_exit: "初決済",
    first_profit: "初利益確定",
    first_loss: "初損失確定",
    first_stop_loss: "初損切り",
    first_take_profit: "初利確",
    new_equity_high: "資産最高値更新",
    new_max_drawdown: "最大Drawdown更新",
    winning_streak: "連勝記録",
    losing_streak: "連敗記録",
    equity_milestone_up: "資産上昇の節目突破",
    equity_milestone_down: "資産下落の節目",
    benchmark_cross_above: "日経225を初めて上回る",
    benchmark_cross_below: "日経225を初めて下回る",
    trading_day_milestone: "運用日数の節目",
  };
  return labels[type] ?? type;
}
