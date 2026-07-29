"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import {
  Activity,
  ChartLine,
  Compass,
  Gauge,
  Layers,
  LineChart,
  LoaderCircle,
  Search,
  Star,
  TrendingUp,
  Volume2,
  Waypoints,
  Zap,
} from "lucide-react";
import Header from "./components/Header";
import MarketCard from "./components/MarketCard";
import DashboardSection from "./components/DashboardSection";
import WatchlistCard from "./components/WatchlistCard";
import StrategyCard from "./components/StrategyCard";
import CoachComment from "./components/CoachComment";
import EntryBlockBanner from "./components/EntryBlockBanner";
import EntryTimingCard from "./components/EntryTimingCard";
import AICoachComment from "./components/AICoachComment";
import CheckpointList from "./components/CheckpointList";
import BeginnerAdviceCard from "./components/BeginnerAdviceCard";
import Disclaimer from "./components/Disclaimer";
import DetailedAnalysisSection from "./components/DetailedAnalysisSection";
import DiffCard from "./components/DiffCard";
import ScoreCard from "./components/ScoreCard";
import ScoreBreakdown from "./components/ScoreBreakdown";
import ReasonsList from "./components/ReasonsList";
import IndicatorCard from "./components/IndicatorCard";
import PriceLevelsCard from "./components/PriceLevelsCard";
import AIComment from "./components/AIComment";
import HistoryCard from "./components/HistoryCard";
import type { AnalysisResult } from "./lib/technicalAnalysis/types";
import { buildCheckpoints } from "./lib/technicalAnalysis/checkpoints";
import {
  addToWatchlist,
  getWatchlistServerSnapshot,
  getWatchlistSnapshot,
  removeFromWatchlist,
  subscribeWatchlist,
} from "./lib/localStore/watchlist";
import {
  addHistoryEntry,
  computeDiff,
  findPreviousEntry,
  getHistoryServerSnapshot,
  getHistorySnapshot,
  subscribeHistory,
  type AnalysisDiff,
  type HistoryEntry,
} from "./lib/localStore/history";

type StockAnalysis = AnalysisResult & {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  beginnerAdvice: string;
};

export default function Home() {
  const [stockCode, setStockCode] = useState("");
  const [analysis, setAnalysis] = useState<StockAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [diff, setDiff] = useState<AnalysisDiff | null>(null);

  const watchlist = useSyncExternalStore(subscribeWatchlist, getWatchlistSnapshot, getWatchlistServerSnapshot);
  const history = useSyncExternalStore(subscribeHistory, getHistorySnapshot, getHistoryServerSnapshot);

  const analyzeStock = async (codeOverride?: string) => {
    const code = codeOverride ?? stockCode;
    if (!code) {
      alert("銘柄コードを入力してください。");
      return;
    }

    setStockCode(code);
    setIsLoading(true);
    try {
      const response = await fetch(`/api/v1/stock?code=${code}`);
      const data = await response.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      const newEntry: HistoryEntry = {
        code,
        name: data.name,
        score: data.score,
        signal: data.signal,
        confidence: data.confidence,
        strategyAction: data.strategy.action,
        timestamp: new Date().toISOString(),
      };

      const previous = findPreviousEntry(history, code);
      setDiff(previous ? computeDiff(previous, newEntry) : null);
      addHistoryEntry(newEntry);
      setAnalysis(data);
    } catch {
      alert("分析中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToWatchlist = () => {
    if (!analysis) return;
    addToWatchlist({ code: stockCode, name: analysis.name });
  };

  const handleRemoveFromWatchlist = (code: string) => {
    removeFromWatchlist(code);
  };

  const isWatchlisted = watchlist.some((item) => item.code === stockCode);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-black/50 ring-1 ring-amber-500/10 sm:p-8">
        <Header />

        <div className="mb-4 flex justify-end">
          <Link
            href="/verification"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            <BarChart3 size={14} />
            検証ダッシュボード
          </Link>
        </div>

        <MarketCard />

        <div className="mt-6 space-y-6">
          <DashboardSection />

          <WatchlistCard
            items={watchlist}
            onAnalyze={analyzeStock}
            onRemove={handleRemoveFromWatchlist}
          />
        </div>

        <div className="mt-8">
          <label className="mb-2 block text-sm font-semibold text-slate-300">
            🔎 銘柄コード
          </label>

          <input
            type="text"
            value={stockCode}
            onChange={(e) => setStockCode(e.target.value)}
            placeholder="例：7203"
            className="w-full rounded-xl border border-gray-300 bg-white p-3 text-black placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />

          <button
            onClick={() => analyzeStock()}
            disabled={isLoading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-lg font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800/60"
          >
            {isLoading ? (
              <>
                <LoaderCircle size={20} className="animate-spin" />
                分析中...
              </>
            ) : (
              <>
                <Search size={20} />
                分析する
              </>
            )}
          </button>

          {analysis && (
            <div className="mt-6 space-y-4">
              {/* 今日のAIコーチビュー：画面を開いて10秒以内に「今日やること」が伝わることを最優先にする */}
              <EntryTimingCard action={analysis.todayAction} timingScore={analysis.entryTimingScore} />

              {analysis.entryBlock.level === "caution" && (
                <EntryBlockBanner level={analysis.entryBlock.level} reason={analysis.entryBlock.reason} />
              )}

              <AICoachComment comment={analysis.todayActionReason} />

              <CheckpointList checkpoints={buildCheckpoints(analysis)} />

              <PriceLevelsCard
                entryPrice={analysis.entryPrice}
                takeProfit={analysis.takeProfit}
                stopLoss={analysis.stopLoss}
                riskReward={analysis.riskReward}
                riskLevel={analysis.risk.level}
              />

              <BeginnerAdviceCard advice={analysis.beginnerAdvice} />

              <Disclaimer />

              <DetailedAnalysisSection>
                <StrategyCard
                  strategy={analysis.strategy}
                  sentiment={analysis.sentiment}
                  risk={analysis.risk}
                  entryPriority={analysis.entryPriority}
                />

                <CoachComment comment={analysis.coachComment} />

                {diff && <DiffCard diff={diff} />}

                <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-lg font-bold text-white">
                      {analysis.name}
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {analysis.symbol}
                      </span>
                    </h2>
                    <span className={`tabular-nums ${analysis.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {analysis.change >= 0 ? "+" : ""}
                      {analysis.change} 円（{analysis.changePercent.toFixed(2)}%）
                    </span>
                  </div>

                  <button
                    onClick={handleAddToWatchlist}
                    disabled={isWatchlisted}
                    className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    <Star size={14} className={isWatchlisted ? "" : "fill-amber-300"} />
                    {isWatchlisted ? "ウォッチリストに登録済み" : "ウォッチリストに追加"}
                  </button>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm text-slate-300">
                    <div>
                      <p className="text-xs text-slate-500">現在値</p>
                      <p className="tabular-nums font-semibold text-white">{analysis.price.toLocaleString()}円</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">高値 / 安値</p>
                      <p className="tabular-nums font-semibold text-white">
                        {analysis.high.toLocaleString()} / {analysis.low.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">始値</p>
                      <p className="tabular-nums font-semibold text-white">{analysis.open.toLocaleString()}円</p>
                    </div>
                  </div>
                </div>

                <ScoreCard
                  score={analysis.score}
                  signal={analysis.signal}
                  confidence={analysis.confidence}
                  trend={analysis.trend}
                />

                <ScoreBreakdown breakdown={analysis.scoreBreakdown} />

                <ReasonsList reasons={analysis.reasons} />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <IndicatorCard icon={ChartLine} reason={analysis.indicators.movingAverage5} />
                  <IndicatorCard icon={LineChart} reason={analysis.indicators.movingAverage25} />
                  <IndicatorCard icon={TrendingUp} reason={analysis.indicators.movingAverage75} />
                  <IndicatorCard icon={Activity} reason={analysis.indicators.macd} />
                  <IndicatorCard icon={Gauge} reason={analysis.indicators.rsi} />
                  <IndicatorCard
                    icon={Volume2}
                    reason={analysis.indicators.volume}
                    badge={`×${analysis.indicators.volume.ratio.toFixed(1)}`}
                  />
                  <IndicatorCard icon={Layers} reason={analysis.indicators.supportResistance} />
                  <IndicatorCard icon={Compass} reason={analysis.indicators.trend} />
                  <IndicatorCard icon={Waypoints} reason={analysis.indicators.dowTheory} />
                  <IndicatorCard icon={Zap} reason={analysis.indicators.atr} />
                </div>

                <AIComment comment={analysis.aiComment} />
              </DetailedAnalysisSection>
            </div>
          )}

          <div className="mt-6">
            <HistoryCard entries={history} onAnalyze={analyzeStock} />
          </div>
        </div>
      </div>
    </main>
  );
}
