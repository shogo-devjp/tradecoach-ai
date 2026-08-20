import YahooFinance from "yahoo-finance2";
import { getVerificationLog, updateRecords } from "./store";
import type { VerificationRecord } from "./types";

const yahooFinance = new YahooFinance();

// scanUniverse.tsと同じ考え方でYahoo Financeへの同時リクエスト数を絞る。
// Version 1.1までは1件ずつ逐次処理していたため、未決済レコードが増えるほど
// 決済処理全体の所要時間が線形に伸び続ける問題があった（並列化のみでロジックは変えない）。
const SETTLE_CONCURRENCY = 8;

// app/lib/universeVerification（225銘柄verification、Version 1.5想定）から再利用するためexportする。
// 既存の30銘柄verification（このファイル）のロジック・挙動は一切変更しない（exportキーワードの追加のみ）。
// 「既存の定義・ロジックが利用可能な場合は勝手に別基準を作らない」方針に基づき、
// 1/3/5営業日後の判定・騰落率計算・勝敗判定は必ずこの関数群を再利用すること。
export function computeChangePercent(base: number, current: number): number {
  return Math.round(((current - base) / base) * 1000) / 10;
}

export async function fetchFutureCloses(code: string, judgedAt: string): Promise<{ date: string; close: number }[]> {
  const period1 = new Date(judgedAt);
  const period2 = new Date(judgedAt);
  period2.setDate(period2.getDate() + 15);

  const chart = await yahooFinance.chart(`${code}.T`, { period1, period2, interval: "1d" });
  return chart.quotes
    .filter((q) => q.close !== null)
    .map((q) => ({ date: q.date.toISOString().slice(0, 10), close: q.close as number }))
    .filter((q) => q.date > judgedAt); // 判定日当日は含めず、翌営業日以降のみを対象にする
}

// 買い＝上昇で勝ち、売り＝下落で勝ち。方向性のあるシグナルのみ勝敗をつけられる。
export function resolveDirectionalOutcome(signal: "買い" | "売り", day5ChangePercent: number): "win" | "loss" {
  return signal === "買い"
    ? day5ChangePercent > 0
      ? "win"
      : "loss"
    : day5ChangePercent < 0
      ? "win"
      : "loss";
}

// Version 1.2: 「待ち」（およびentryTiming/todayActionが本日は休みましょう・見送り・
// 押し目待ち・ブレイク待ち・様子見の買い/売り）も、方向性のある勝敗こそつけられないが
// day1/day3/day5の価格は買い/売りと同じロジックで追跡する。これにより
// 「エントリーしなかった判断が結果的にどうだったか」を後から検証できるようにする。
// Version 1.1以前は「待ち」を即座にoutcome="neutral"へ確定し価格を一切追跡していなかったため、
// 挙動が変わる点に注意（互換性への影響はtypes.tsのコメント・報告を参照）。
async function settleOne(record: VerificationRecord): Promise<boolean> {
  if (record.outcome !== "pending") return false;

  try {
    const futureCloses = await fetchFutureCloses(record.code, record.judgedAt);
    if (futureCloses.length === 0) return false;

    let changed = false;

    if (!record.day1 && futureCloses[0]) {
      record.day1 = {
        date: futureCloses[0].date,
        changePercent: computeChangePercent(record.priceAtJudgment, futureCloses[0].close),
      };
      changed = true;
    }
    if (!record.day3 && futureCloses[2]) {
      record.day3 = {
        date: futureCloses[2].date,
        changePercent: computeChangePercent(record.priceAtJudgment, futureCloses[2].close),
      };
      changed = true;
    }
    if (!record.day5 && futureCloses[4]) {
      record.day5 = {
        date: futureCloses[4].date,
        changePercent: computeChangePercent(record.priceAtJudgment, futureCloses[4].close),
      };
      record.outcome =
        record.signal === "買い" || record.signal === "売り"
          ? resolveDirectionalOutcome(record.signal, record.day5.changePercent)
          : "observed";
      changed = true;
    }

    return changed;
  } catch {
    // 上場廃止・コード変更等で個別銘柄の取得に失敗しても他のレコードの処理は継続する
    return false;
  }
}

// 判定日から翌営業日・3営業日後・5営業日後が経過したレコードについて、
// Yahoo Financeの日足を再取得し騰落率と勝敗（買い×上昇/売り×下落＝勝ち）を確定する。
export async function settlePendingRecords(): Promise<VerificationRecord[]> {
  const records = await getVerificationLog();
  const pending = records.filter((r) => r.outcome === "pending");
  let changed = false;

  for (let i = 0; i < pending.length; i += SETTLE_CONCURRENCY) {
    const chunk = pending.slice(i, i + SETTLE_CONCURRENCY);
    const results = await Promise.all(chunk.map((record) => settleOne(record)));
    if (results.some(Boolean)) changed = true;
  }

  if (changed) await updateRecords(records);
  return records;
}
