import type { Notifier } from "./types";
import { consoleNotifier } from "./consoleNotifier";
import { lineNotifier } from "./lineNotifier";

// NOTIFIER_CHANNEL 環境変数だけでconsole/LINEを切り替えられるようにする。
// コードを変更せずにデプロイ設定だけで通知先を切り替えられることを狙っている。
export function getDefaultNotifier(): Notifier {
  return process.env.NOTIFIER_CHANNEL === "line" ? lineNotifier : consoleNotifier;
}
