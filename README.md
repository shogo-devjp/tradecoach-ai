This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

> 本アプリの分析結果は投資判断の参考情報であり、投資助言ではありません。一般公開・有料化を検討する際は必ず[COMPLIANCE.md](./COMPLIANCE.md)を確認してください。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## LINE通知連携

TradeCoach AIの買いシグナル・売りシグナルをLINE公式アカウントから配信できます。通知処理は`app/lib/notifications/`にあり、`Notifier`インターフェース経由で送信先（console/LINE）を差し替えられる構成になっています。

### 通知の仕組み

- `app/lib/notifications/messageBuilder.ts` — 通知文の生成のみを担当（送信処理から独立）
- `app/lib/notifications/lineClient.ts` — LINE Messaging APIへの実HTTP呼び出し（`LineMessagingClient`インターフェース）
- `app/lib/notifications/lineNotifier.ts` — 上記2つを組み合わせて`Notifier`を実装
- `app/lib/notifications/consoleNotifier.ts` — LINE未設定時のデフォルト。同じメッセージ内容をコンソールに出力する
- `app/lib/notifications/defaultNotifier.ts` — `NOTIFIER_CHANNEL`環境変数でconsole/LINEを切り替える

対応している通知種類（`NotificationEvent`）：買いシグナル・売りシグナル・Today's Picks・ウォッチリスト銘柄のシグナル変化。現在実際にAPIから発火するのは日経225スクリーニング実行時の買い/売りシグナルのみで、残り2種類は型とメッセージ生成のみ用意しています（詳細は実装完了時の報告を参照）。

### LINE Developersで行う設定

1. [LINE Developers Console](https://developers.line.biz/console/) にログインし、プロバイダーを作成（未作成の場合）
2. 新規チャネルを作成する際に **Messaging API** を選択
3. チャネル作成後の管理画面で以下を取得・設定する
   - **チャネルアクセストークン**：「Messaging API設定」タブの「チャネルアクセストークン（長期）」から発行
   - **チャネルシークレット**：「チャネル基本設定」タブに表示されている値
   - **Webhook URL**：「Messaging API設定」タブで `https://<デプロイ先ドメイン>/api/v1/line/webhook` を設定し、「Webhookの利用」をオンにする
4. 応答メッセージ（自動応答）は今回不要なため、Messaging API設定タブでオフにしておくことを推奨（Botからの自動返信と通知が混ざらないようにするため）
5. 公式アカウントをLINEアプリで友だち追加しておく（`broadcast`は友だち全員に届くため、動作確認用に自分のアカウントを追加しておく）

### 環境変数

`.env.local`（Next.jsのローカル環境変数ファイル）に以下を設定してください。

```bash
# LINE Messaging API
LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LINE_CHANNEL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# console（デフォルト・未設定時）/ line のどちらに通知を送るか
NOTIFIER_CHANNEL=line
```

`NOTIFIER_CHANNEL`を設定しない場合は、これまで通り`consoleNotifier`が使われ、通知内容がサーバーのログに出力されるだけになります（LINEの認証情報が無くても開発・動作確認ができます）。

### 制約・今後の対応

- `broadcast`は公式アカウントの友だち全員への一斉配信のみで、ユーザーごとの個別配信（`push`）はまだ配線していません。個別配信にはLINEの`userId`をどこかに保存する仕組みが必要です（`app/api/v1/line/webhook/route.ts`で`follow`イベントを受け取って保存する形を想定）。
- 「ウォッチリスト銘柄のシグナル変化通知」を実際に自動発火させるには、サーバー側のウォッチリスト永続化（現在は各ユーザーのブラウザの`localStorage`のみ）が必要です。
- 「毎朝8:30配信」はmacOS LaunchAgentで実装済みです（下記「毎朝8:30の自動通知」を参照）。

## 毎朝8:30の自動通知（LaunchAgent）

日経225スクリーニング（`POST /api/v1/screening/signals`）を毎朝8:30（Macのシステム時刻基準）に自動実行し、買い/売りシグナルをLINEへ通知します。macOSのLaunchAgentという仕組みを使っており、Macにログインしている間、`next dev`（または`next start`）がlocalhost:3000で起動していれば動作します。

### 構成ファイル

- `scripts/run-morning-signal.sh` — 実行本体。`POST /api/v1/screening/signals`を叩き、結果を`logs/morning-signal.log`に記録する
- `scripts/com.tradecoachai.morningsignal.plist` — LaunchAgentの定義（リポジトリ内はテンプレート）。実際に登録されているのは`~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist`

### 前提条件・注意点

- `next dev`または`next start`が起動していない場合、通知は失敗し`logs/morning-signal.log`にERRORが記録されます（アプリ自体の自動起動は今回のスコープ外です）。
- Macがスリープ中は8:30になっても実行されません（起床後に自動的に追いつく機能はありません）。
- `~/Library/LaunchAgents/`にplistを置いているため、Macを再起動・再ログインしても**自動的に再登録され、追加の操作は不要**です（＝「Mac起動時に自動開始」）。

### 停止方法

```bash
launchctl unload -w ~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist
```

再度自動実行を止めたままにしたい場合は、上記に加えて`~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist`を削除してください（`rm ~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist`）。unloadだけだと次回ログイン時にまた自動登録されます。

### 再起動方法（設定変更後の反映等）

```bash
launchctl unload -w ~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist
cp scripts/com.tradecoachai.morningsignal.plist ~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist
launchctl load -w ~/Library/LaunchAgents/com.tradecoachai.morningsignal.plist
```

### 今すぐテスト実行する方法（8:30を待たない）

```bash
launchctl start com.tradecoachai.morningsignal
```

### ログ確認方法

```bash
# 通知処理そのものの成功/失敗ログ（毎回1行）
tail -f logs/morning-signal.log

# launchdがスクリプトを起動できたかどうかの低レベルなログ（通常は空でよい）
cat logs/launchd-stdout.log
cat logs/launchd-stderr.log

# 現在登録されているか、直近の終了コードを確認
launchctl list | grep tradecoachai
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
