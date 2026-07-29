import type { ScreenedStock } from "./types";

export function rankBuySignals(candidates: ScreenedStock[], minScore: number, limit = 10): ScreenedStock[] {
  return candidates
    .filter((candidate) => candidate.signal === "買い" && candidate.score >= minScore)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, limit);
}

// スコア昇順（低い＝弱気が強い順）で並べ、注意すべき「売り」銘柄を上位に出す
export function rankSellSignals(candidates: ScreenedStock[], limit = 5): ScreenedStock[] {
  return candidates
    .filter((candidate) => candidate.signal === "売り")
    .sort((a, b) => a.score - b.score || b.confidence - a.confidence)
    .slice(0, limit);
}
