import type { AnalysisResult, TodayAction } from "./types";

// 「今日のチェックポイント」は日足トレンド・地合い・出来高の3つに固定する
// （情報量を増やさず、初心者が毎回同じ3軸で状況を把握できるようにするため）。
export function buildCheckpoints(analysis: Pick<AnalysisResult, "trend" | "marketRegime" | "indicators">): string[] {
  const trendCheckpoint = `日足は${analysis.trend}トレンド`;

  const marketCheckpoint =
    analysis.marketRegime.overall === "強い"
      ? "地合いは良好です"
      : analysis.marketRegime.overall === "弱い"
        ? "地合いはやや弱いです"
        : "地合いは方向感に乏しいです";

  const volumeStatus = analysis.indicators.volume.status;
  const volumeCheckpoint =
    volumeStatus === "positive"
      ? "出来高は平均以上です"
      : volumeStatus === "negative"
        ? "出来高は平均以下です"
        : "出来高は平均並みです";

  return [trendCheckpoint, marketCheckpoint, volumeCheckpoint];
}

const BEGINNER_ADVICE: Record<TodayAction, string[]> = {
  今すぐエントリー: [
    "分析条件はそろっていますが、焦って大きく張る必要はありません。",
    "エントリーする場合も、まずは少額から試すと安心です。",
  ],
  押し目待ち: [
    "焦って飛び乗るより、押し目を待つことも立派な戦略です。",
    "今日は無理に動かず、値動きを確認してからでも遅くありません。",
  ],
  ブレイク待ち: [
    "抜けるかどうかを確認してからでも十分間に合います。",
    "焦って先回りする必要はありません。",
  ],
  様子見: [
    "今日は無理をせず、次の分かりやすいチャンスを待ちましょう。",
    "様子を見ることも、立派な投資判断の一つです。",
  ],
  見送り: [
    "今日は見送りが賢明です。チャンスはまた巡ってきます。",
    "無理に取引しないことも、資産を守る大切な選択です。",
  ],
  本日は休みましょう: [
    "今日は飛び乗り買いは避けましょう。",
    "焦ってエントリーする必要はありません。",
    "何もしないことも、資産形成を続けるための立派な戦略です。",
  ],
};

// 単純な文字列ハッシュ。Math.random()は使わず、銘柄コード・日付・todayActionから
// 決定的にインデックスを選ぶことで「同じ銘柄・同じ日・同じ判定なら常に同じ助言」を保証する。
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// 初心者向けの一般的な心構え文。todayActionReason（状況固有の理由）とは役割を分け、
// こちらは相場全般に効く心構えを扱う（重複させない）。dateKeyが変われば別の文言になりうる。
export function pickBeginnerAdvice(code: string, dateKey: string, todayAction: TodayAction): string {
  const candidates = BEGINNER_ADVICE[todayAction];
  const index = hashString(`${code}-${dateKey}-${todayAction}`) % candidates.length;
  return candidates[index];
}
