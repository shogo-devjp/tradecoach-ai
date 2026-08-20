"use client";

import { useState } from "react";
import ChallengeView from "@/app/components/ChallengeView";

// ?capture=1 を付けるとYouTube Safe Capture Mode（app/challenge/capture/page.tsx と同じ描画）になる。
// このコンポーネント自体はpage.tsx側でssr:falseとしてロードされるため常にブラウザ内でのみ
// 初回レンダリングされ、window.location.searchを遅延初期化子でそのまま読んでも
// サーバー/クライアント間のレンダリング不一致（hydration mismatch）が発生しない。
function readCaptureModeFromLocation(): boolean {
  return new URLSearchParams(window.location.search).get("capture") === "1";
}

export default function ChallengePageClient() {
  const [captureMode] = useState(readCaptureModeFromLocation);
  return <ChallengeView captureMode={captureMode} />;
}
