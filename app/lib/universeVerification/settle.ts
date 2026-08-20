import { computeChangePercent, fetchFutureCloses, resolveDirectionalOutcome } from "../verification/settle";
import { readUniverseVerificationLog, updateUniverseVerificationRecords } from "./store";
import type { SettleUniverseVerificationResult, UniverseVerificationRecord } from "./types";

// 既存verification/settle.tsと全く同じ並行数（Yahoo Financeへの同時リクエスト数を絞る）。
const SETTLE_CONCURRENCY = 8;

export type FutureClosesProvider = (code: string, judgedAt: string) => Promise<{ date: string; close: number }[]>;

// 既存verification/settle.tsのsettleOne()と全く同じロジック（1/3/5営業日後の判定・
// 騰落率計算・勝敗判定はfetchFutureCloses/computeChangePercent/resolveDirectionalOutcomeを
// そのまま再利用し、独自基準を作らない）。「1日後・3日後・5日後」は暦日ではなく、
// fetchFutureCloses()がYahoo Financeの日足（実際に取引があった日のみ）を返すため、
// 自動的に土日・休場日を除いた1/3/5営業日後になる（既存settle.tsと同じ仕組みをそのまま流用）。
//
// fail-safe：価格データが1件も取得できない場合・取得に失敗した場合はレコードをpendingのまま
// 変更しない（誤った結果を確定しない）。day1/day3/day5は一度確定した値を上書きしない
// （既存settleOne()と同じ「!record.day1 && ...」ガードをそのまま踏襲）。
async function settleOne(record: UniverseVerificationRecord, closesProvider: FutureClosesProvider): Promise<boolean> {
  if (record.outcome !== "pending") return false;

  try {
    const futureCloses = await closesProvider(record.code, record.date);
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
          : "observed"; // WAITは二値化せず、day1/3/5の生データで後から分析できるようにする
      changed = true;
    }

    return changed;
  } catch {
    // 上場廃止・コード変更等で個別銘柄の取得に失敗しても他のレコードの処理は継続する
    return false;
  }
}

// closesProviderは既定でfetchFutureCloses（実際のYahoo Finance日足取得）を使う。
// テストからは業務日（土日・休場日を除いた実際の取引日）のみを含む固定データを注入できるようにし、
// ネットワーク越しの実データに依存せず1/3/5営業日後の判定ロジックを検証できるようにする。
export async function settlePendingUniverseVerificationRecords(
  closesProvider: FutureClosesProvider = fetchFutureCloses
): Promise<SettleUniverseVerificationResult> {
  const records = await readUniverseVerificationLog();
  const pending = records.filter((r) => r.outcome === "pending");
  let changed = false;
  let updatedCount = 0;

  for (let i = 0; i < pending.length; i += SETTLE_CONCURRENCY) {
    const chunk = pending.slice(i, i + SETTLE_CONCURRENCY);
    const results = await Promise.all(chunk.map((record) => settleOne(record, closesProvider)));
    results.forEach((r) => {
      if (r) {
        changed = true;
        updatedCount++;
      }
    });
  }

  if (changed) await updateUniverseVerificationRecords(records);
  return { processedCount: pending.length, updatedCount };
}
