import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// このプロジェクトにはブラウザDOMテスト環境（jsdom・React Testing Library等）が導入されていない
// （既存テストはすべてnode:testでのlibロジック検証のみ）。そのためCapture Modeの見た目・
// レンダリング結果そのものを自動テストすることはできず、以下2種類で検証する：
//   (a) ソースコード上の不変条件（このファイル）：Capture専用ルートが「戻る」リンク等の
//       アプリ内ナビゲーションを構造的に持ち得ないこと、共有コンポーネント側の分岐が
//       captureModeを正しく参照していること
//   (b) 実ブラウザでのdry-run確認（次の報告で実施）：/challenge と /challenge/capture の
//       レンダリング結果を目視・HTML比較で確認
const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.join(REPO_ROOT, relativePath), "utf-8");
}

// テストケース3: capture modeと通常画面との差分が表示用途だけであることの確認
// （両者が同じ ChallengeView を共有し、captureModeというUI表示切り替え用のbooleanプロパティ
// 以外の分岐（データ取得APIやロジック）を持たないこと）
test("/challenge と /challenge/capture は同じChallengeViewコンポーネントを共有し、データ取得ロジックは分岐しない", async () => {
  const normalPage = await readSource("app/challenge/page.tsx");
  const normalPageClient = await readSource("app/challenge/ChallengePageClient.tsx");
  const capturePage = await readSource("app/challenge/capture/page.tsx");
  const view = await readSource("app/components/ChallengeView.tsx");

  assert.match(normalPage, /dynamic\(\(\) => import\("\.\/ChallengePageClient"\), \{ ssr: false \}\)/, "通常ページはhydration mismatchを避けるためssr:falseで読み込む");
  assert.match(normalPageClient, /<ChallengeView captureMode=\{captureMode\}/, "通常ページはChallengeViewへcaptureModeを渡すだけ");
  assert.match(capturePage, /<ChallengeView captureMode=\{true\}/, "Captureページは常にcaptureMode:trueでChallengeViewを描画する");
  // いずれもデータ取得（fetch）を自前で行わない＝ChallengeView側の唯一の実装のみを使う
  assert.doesNotMatch(normalPage, /fetch\(/, "通常ページ自体はfetchを行わない（ChallengeViewに委譲）");
  assert.doesNotMatch(normalPageClient, /fetch\(/, "通常ページ（クライアント本体）もfetchを行わない（ChallengeViewに委譲）");
  assert.doesNotMatch(capturePage, /fetch\(/, "Captureページ自体はfetchを行わない（ChallengeViewに委譲）");
  // fetch先は/api/v1/challenge/dashboard（読み取り専用）の1箇所のみ
  const fetchCalls = [...view.matchAll(/fetch\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(fetchCalls, ["/api/v1/challenge/dashboard"], "captureModeの有無に関わらずデータ取得先は同一の読み取り専用APIのみ");
});

// テストケース1・2: capture modeでは必要情報だけが表示され、開発者向け情報・ナビゲーションが
// 構造的に出ない（ソースコード上の不変条件として確認）
test("ChallengeViewはcaptureMode時にアプリ内ナビゲーション（「戻る」リンク）を描画しない条件分岐を持つ", async () => {
  const view = await readSource("app/components/ChallengeView.tsx");
  assert.match(view, /\{!captureMode && \(\s*<Link href="\/"/, "「戻る」リンクは!captureModeの場合のみ描画される");
});

test("ChallengeView・Challengeページ群はファイルパス・APIキー・LINE関連情報・Git情報等を一切参照しない", async () => {
  const files = [
    "app/components/ChallengeView.tsx",
    "app/challenge/page.tsx",
    "app/challenge/ChallengePageClient.tsx",
    "app/challenge/capture/page.tsx",
  ];
  const forbiddenPatterns = [
    /process\.env/i, // .env情報・APIキー等の環境変数を直接描画しない
    /LINE_CHANNEL/i, // LINE関連の秘密情報
    /require\(["']child_process["']\)/i, // Git情報等を取得する手段を持たない
    /os\.userInfo/i, // Macユーザー名
    /homedir\(/i, // ローカルファイルパス
  ];
  for (const file of files) {
    const source = await readSource(file);
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${file} が禁止パターン ${pattern} を含んでいる`);
    }
  }
});

test("ChallengeViewはcaptureMode時、データ未確定（読み込み中・取得失敗・0件）を安全なプレースホルダー1種類に統一する（fail-safe）", async () => {
  const view = await readSource("app/components/ChallengeView.tsx");
  assert.match(view, /const safeForPublishing = !isLoading && !fetchFailed && latest !== null;/);
  assert.match(view, /\{captureMode && !safeForPublishing && \(/, "captureMode時は状態を出し分けず単一のプレースホルダーのみ表示する");
});

// テストケース4: capture modeがPaper Tradingデータを書き換えない
// captureModeはクライアント側の表示切り替えに過ぎず、参照するAPI
// （GET /api/v1/challenge/dashboard）はChallenge/Paper Trading双方のデータを
// 読み取り専用関数のみで構成していることを確認する（書き込み系関数を一切importしない）。
test("GET /api/v1/challenge/dashboardは読み取り専用関数のみで構成され、書き込み系関数をimportしない", async () => {
  const route = await readSource("app/api/v1/challenge/dashboard/route.ts");
  assert.match(route, /import \{ readChallengeMeta, readDailyRecords, readEvents \} from/);
  const forbiddenWrites = [/append/i, /write/i, /save/i, /upsert/i, /activate/i, /initialize/i];
  for (const pattern of forbiddenWrites) {
    assert.doesNotMatch(route, pattern, `dashboard routeが書き込み系識別子 ${pattern} を含んでいる`);
  }
});

// テストケース4（実データでの確認）：dashboard集計に使う読み取り関数を複数回呼んでも
// 実際のPaper Trading/Challengeデータファイルが変化しないことを確認する。
test("dashboard集計に使う読み取り関数を複数回呼んでもデータファイルの内容は一切変化しない", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "challenge-capturemode-readonly-"));
  process.env.CHALLENGE_DATA_DIR = dir;
  try {
    const { readChallengeMeta, readDailyRecords, readEvents } = await import("../store");
    const { ensureChallengeInitialized } = await import("../challengeMeta");
    await ensureChallengeInitialized();

    const before = JSON.stringify(await readChallengeMeta());
    for (let i = 0; i < 5; i++) {
      await readChallengeMeta();
      await readDailyRecords();
      await readEvents();
    }
    const after = JSON.stringify(await readChallengeMeta());
    assert.equal(after, before, "ダッシュボード表示相当の読み取りを繰り返してもChallengeデータは一切変化しない");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CHALLENGE_DATA_DIR;
  }
});
