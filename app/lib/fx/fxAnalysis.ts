import { getPairConfig } from "./pairs";
import { fetchFxMultiTimeframeData } from "./data/yahooFxProvider";
import { getCachedFxAnalysis, setCachedFxAnalysis } from "./data/cache";
import { analyzeFxPair } from "./analyzeFxPair";
import type { FxAnalysisResult } from "./types";

// 株式版のanalyzeStockByCode（app/lib/stockAnalysis.ts）に相当するFX版のオーケストレーション層。
// データ取得（副作用）とanalyzeFxPair（純粋関数・要件19）を分離することで、
// analyzeFxPairだけを使えばバックテストにも流用できる構成を保っている。
export async function analyzeFxPairById(pairId: string): Promise<FxAnalysisResult> {
  const pair = getPairConfig(pairId);

  const cached = getCachedFxAnalysis(pair.id);
  if (cached) return cached;

  const data = await fetchFxMultiTimeframeData(pair);
  const result = analyzeFxPair(pair, data);

  return setCachedFxAnalysis(pair.id, result);
}
