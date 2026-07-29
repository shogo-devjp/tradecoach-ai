import type { RiskLevel, Signal, StrategyAction, TodayStrategy, TrendDirection } from "./types";

const ACTION_BY_SIGNAL: Record<Signal, StrategyAction> = {
  買い: "買い場",
  待ち: "待機",
  売り: "利確優先",
};

export function buildTodayStrategy(
  signal: Signal,
  trend: TrendDirection,
  riskLevel: RiskLevel,
  rsiValue: number
): TodayStrategy {
  const action = ACTION_BY_SIGNAL[signal];

  if (action === "買い場") {
    const headline = "本日は買いを検討できる地合いです";
    const description =
      rsiValue >= 70
        ? "ただしRSIが高水準で過熱気味のため、一気に全額投入せず、押し目を待って分割エントリーするのも一案です。"
        : riskLevel === "高"
          ? "値動きの幅が大きくリスクは高めなので、少額から様子を見つつ入るのがおすすめです。"
          : `${trend}トレンドが続いており、分析上はエントリーを検討しやすい場面です。`;
    return { action, headline, description };
  }

  if (action === "利確優先") {
    const headline = "本日は利益確定・様子見を優先しましょう";
    const description =
      trend === "下降"
        ? "下降トレンドが強まりつつあるため、保有中なら利益確定、新規の売買は見送るのが無難です。"
        : "弱含みのサインが出ているため、無理に持ち続けず利益確定ラインを意識しましょう。";
    return { action, headline, description };
  }

  const headline = "本日は様子見が賢明です";
  const description =
    riskLevel === "高"
      ? "値動きが荒く方向感も乏しいため、無理にポジションを取らず落ち着くのを待ちましょう。"
      : "指標間で方向感が分かれています。焦って動かず、次のシグナルを待ちましょう。";
  return { action, headline, description };
}
