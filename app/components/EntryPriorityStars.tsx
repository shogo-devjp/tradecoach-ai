import StarRating from "./StarRating";

export default function EntryPriorityStars({ priority }: { priority: number }) {
  return <StarRating value={priority} label="エントリー優先度" />;
}
