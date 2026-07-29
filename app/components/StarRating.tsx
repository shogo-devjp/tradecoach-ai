import { Star } from "lucide-react";

interface StarRatingProps {
  value: number;
  max?: number;
  label: string;
}

export default function StarRating({ value, max = 5, label }: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${label} ${value} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={18}
          className={i < value ? "fill-amber-400 text-amber-400" : "text-slate-600"}
        />
      ))}
    </div>
  );
}
