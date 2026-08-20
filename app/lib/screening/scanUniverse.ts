import { analyzeStockByCode } from "@/app/lib/stockAnalysis";
import type { ScreenedStock } from "./types";

export interface ScanResult {
  candidates: ScreenedStock[];
  failedCount: number;
}

export interface ScanUniverseOptions {
  // 既存verificationログへ記録するかどうか。省略時（undefined）はanalyzeStockByCode()側の
  // デフォルトtrueに従う＝既存の朝夕本番スキャン（screening/signals/route.ts）の挙動は不変。
  // 開発・性能測定スクリプトからのみ明示的にfalseを渡し、本番verificationログを汚さずに
  // scanUniverse()経由の一括分析を行えるようにする（stockAnalysis.tsのrecordVerificationを
  // scanUniverse()からも伝播できるようにする追加オプション）。
  recordVerification?: boolean;
}

// Yahoo Financeへの同時リクエスト数を絞りつつ、銘柄コード配列を全件分析する。
// 1銘柄の失敗（上場廃止・コード誤り等）が全体を止めないよう Promise.allSettled を使う。
export async function scanUniverse(
  codes: string[],
  concurrency = 8,
  options: ScanUniverseOptions = {}
): Promise<ScanResult> {
  const candidates: ScreenedStock[] = [];
  let failedCount = 0;

  for (let i = 0; i < codes.length; i += concurrency) {
    const chunk = codes.slice(i, i + concurrency);
    // 一括スクリーニングは日足＋地合いフィルターのみとし、60分足・15分足の追加取得は行わない
    // （個別銘柄の2倍のAPI呼び出しが銘柄数分に膨らみスキャン時間が大幅に伸びるため）。
    const settled = await Promise.allSettled(
      chunk.map((code) =>
        analyzeStockByCode(code, { includeIntraday: false, recordVerification: options.recordVerification })
      )
    );

    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const data = result.value;
        candidates.push({
          code: chunk[index],
          symbol: data.symbol,
          name: data.name,
          score: data.score,
          confidence: data.confidence,
          price: data.price,
          signal: data.signal,
          entryPriority: data.entryPriority,
          risk: data.risk.level,
          strategyHeadline: data.strategy.headline,
          aiComment: data.aiComment,
          entryBlock: data.entryBlock,
          todayAction: data.todayAction,
          todayActionReason: data.todayActionReason,
          reasons: data.reasons,
          // Paper Trading用（Signal Snapshotへ転記するため）。既存の表示・通知ロジックは未参照。
          entryPrice: data.entryPrice,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
          // 225銘柄verification用（判断の再現・後解析用）。既存の表示・通知ロジックは未参照。
          indicatorValues: data.indicatorValues,
        });
      } else {
        failedCount++;
      }
    });
  }

  return { candidates, failedCount };
}
