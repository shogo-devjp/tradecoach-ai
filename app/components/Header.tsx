"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 株式版・FX版の切り替えナビ。両方の画面から読み込まれる共通UIのため、
// ここだけは株式・FXの双方から参照される（分析ロジックを一切持たない表示専用コンポーネントのため問題ない）。
function ModeNav() {
  const pathname = usePathname();
  const isFx = pathname?.startsWith("/fx");

  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold transition ${
      active ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-400 hover:text-slate-200"
    }`;

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <Link href="/" className={tabClass(!isFx)}>
        📈 株式
      </Link>
      <Link href="/fx/usdjpy" className={tabClass(!!isFx)}>
        💱 FX
      </Link>
    </div>
  );
}

export default function Header() {
  return (
    <header className="mb-8 text-center">
      <h1 className="text-4xl font-bold text-white">
        📈 TradeCoach AI
      </h1>

      <p className="mt-2 text-slate-300">
        あなた専属のAIトレードコーチ
      </p>

      <ModeNav />
    </header>
  );
}
