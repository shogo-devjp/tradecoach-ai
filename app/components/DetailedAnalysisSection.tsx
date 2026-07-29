"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// 既存の詳細分析（スコア内訳・指標カード・AIコメント全文等）は削除せず、
// トグルで開閉するセクションにまとめる。デフォルトは閉じた状態にすることで、
// 画面を開いた瞬間は「今日やること」だけが目に入るようにする。
export default function DetailedAnalysisSection({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-700"
      >
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {isOpen ? "詳しい分析を閉じる" : "詳しい分析を見る"}
      </button>

      {isOpen && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}
