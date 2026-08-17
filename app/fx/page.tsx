import { redirect } from "next/navigation";

// Phase 1はUSD/JPYのみのため、/fx は自動的に /fx/usdjpy へ転送する。
// 将来ペアが増えたら、ここを通貨ペア選択画面に差し替える。
export default function FxIndexPage() {
  redirect("/fx/usdjpy");
}
