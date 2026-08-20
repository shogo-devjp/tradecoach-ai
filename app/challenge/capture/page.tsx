import ChallengeView from "@/app/components/ChallengeView";

// YouTube Safe Capture Mode専用ルート（/challenge?capture=1 と同等、URLにクエリ文字列が
// 残らない専用ルート版）。画面収録・スクリーンショット時にアプリ内ナビゲーションを含む
// 「アプリらしい」要素を出さず、Challengeの数値・グラフ・取引・イベントだけを表示する。
//
// このページ自体はMacのユーザー名・ローカルファイルパス・.env情報・APIキー・LINE関連情報・
// Git情報・ブラウザの他タブ/ブックマーク/通知・デスクトップ背景・家族写真等を一切扱わない
// （そもそもこのNext.jsアプリのどのページもそれらを描画したことがない）。これらはOS・ブラウザ
// 側の情報であり本ページの責務外のため、実際の収録時はウィンドウ単位のキャプチャ（OS全画面や
// ブラウザの他タブが映り込まない範囲）を使うことを推奨する。将来自動スクリーンショットを
// 実装する場合は、OS全画面キャプチャではなく本ページの
// #challenge-capture-root 要素だけを対象にすることで、この課題を構造的に解決できる。
export default function ChallengeCapturePage() {
  return <ChallengeView captureMode={true} />;
}
