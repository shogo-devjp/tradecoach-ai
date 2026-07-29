import StarRating from "./StarRating";

// 信頼度(0〜100%)を★1〜5に換算する。0%でも最低1つは表示し、コンポーネントが空に見えないようにする。
function toStarValue(confidence: number): number {
  return Math.min(5, Math.max(1, Math.round(confidence / 20)));
}

export default function ConfidenceStars({ confidence }: { confidence: number }) {
  return <StarRating value={toStarValue(confidence)} label="信頼度" />;
}
