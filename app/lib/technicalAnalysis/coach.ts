import type { MarketSentiment, RiskLevel, Signal, TrendDirection } from "./types";

export function generateCoachComment(
  signal: Signal,
  trend: TrendDirection,
  riskLevel: RiskLevel,
  rsiValue: number,
  sentiment: MarketSentiment
): string {
  if (signal === "買い" && rsiValue >= 70) {
    return "「押し目を待つ理由」：すでに値上がりして買われすぎ水準(RSI高め)にあるため、ここで飛び乗ると高値づかみになりやすいです。一度落ち着いて移動平均線付近まで戻るのを待ってからエントリーすると、リスクを抑えやすくなります。";
  }

  if (signal === "買い") {
    return riskLevel === "高"
      ? "買いのシグナルは出ていますが、値動きの幅（リスク）が大きい銘柄です。焦って一度に大きく買わず、少額から試して損切りラインを必ず決めておきましょう。"
      : `複数の指標が上向きで揃っており、${trend}トレンドにも支えられています。ただし相場に「絶対」はないので、入る前に損切りラインを決めてからエントリーする習慣をつけましょう。`;
  }

  if (signal === "売り") {
    return "「新規の買いを焦らない理由」：下向きの指標が優勢な状況で新規に買うのは、落ちてくるナイフを掴むようなものです。保有中の方は利益確定や損切りを検討し、これから始める方は無理に今日動く必要はありません。";
  }

  // signal === "待ち"
  const sentimentNote =
    sentiment === "様子見"
      ? "強気・弱気の材料が拮抗しており、次にどちらへ動くか読みにくい状態です。"
      : `地合いは${sentiment}寄りですが、まだシグナルとしては弱く判断材料が揃っていません。`;

  return `「焦って買わない方がいい理由」：${sentimentNote}こういう時に無理に売買すると、根拠のない賭けになりがちです。次の明確なシグナルが出るまで、資金を温存して待つのも立派な戦略です。`;
}
