"use client";

import dynamic from "next/dynamic";

// ssr:falseにすることで、?capture=1 の有無によるレンダリング差分がサーバー/クライアント間で
// 不一致を起こす（hydration mismatch）リスクを構造的に無くす。このページはもともと
// GET /api/v1/challenge/dashboard への完全クライアントフェッチに依存しており、SSRで得られる
// 恩恵がないため、この変更による実質的なデメリットはない。
const ChallengePageClient = dynamic(() => import("./ChallengePageClient"), { ssr: false });

export default function ChallengePage() {
  return <ChallengePageClient />;
}
