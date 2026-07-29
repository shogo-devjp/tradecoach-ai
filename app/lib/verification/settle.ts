import YahooFinance from "yahoo-finance2";
import { getVerificationLog, updateRecords } from "./store";
import type { VerificationRecord } from "./types";

const yahooFinance = new YahooFinance();

function computeChangePercent(base: number, current: number): number {
  return Math.round(((current - base) / base) * 1000) / 10;
}

async function fetchFutureCloses(code: string, judgedAt: string): Promise<{ date: string; close: number }[]> {
  const period1 = new Date(judgedAt);
  const period2 = new Date(judgedAt);
  period2.setDate(period2.getDate() + 15);

  const chart = await yahooFinance.chart(`${code}.T`, { period1, period2, interval: "1d" });
  return chart.quotes
    .filter((q) => q.close !== null)
    .map((q) => ({ date: q.date.toISOString().slice(0, 10), close: q.close as number }))
    .filter((q) => q.date > judgedAt); // 判定日当日は含めず、翌営業日以降のみを対象にする
}

// 判定日から翌営業日・3営業日後・5営業日後が経過したレコードについて、
// Yahoo Financeの日足を再取得し騰落率と勝敗（買い×上昇/売り×下落＝勝ち）を確定する。
// 「待ち」は方向性のある賭けをしていないため即座にneutral扱いとする。
export async function settlePendingRecords(): Promise<VerificationRecord[]> {
  const records = await getVerificationLog();
  let changed = false;

  for (const record of records) {
    if (record.outcome !== "pending") continue;

    if (record.signal === "待ち") {
      record.outcome = "neutral";
      changed = true;
      continue;
    }

    try {
      const futureCloses = await fetchFutureCloses(record.code, record.judgedAt);
      if (futureCloses.length === 0) continue;

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
          record.signal === "買い"
            ? record.day5.changePercent > 0
              ? "win"
              : "loss"
            : record.day5.changePercent < 0
              ? "win"
              : "loss";
        changed = true;
      }
    } catch {
      // 上場廃止・コード変更等で個別銘柄の取得に失敗しても他のレコードの処理は継続する
      continue;
    }
  }

  if (changed) await updateRecords(records);
  return records;
}
