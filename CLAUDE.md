@AGENTS.md
# TradeCoach AI

## プロジェクトの範囲

- このプロジェクトはTradeCoach AIである（正規の作業場所: `/Users/okashogo/Developer/tradecoach-ai`。`~/Desktop/tradecoach-ai`は使わない）
- 株式分析とFX分析を扱う。アプリケーションは同じTradeCoach AI内で管理するが、分析エンジンは分離する（`app/lib/technicalAnalysis/`=株式版、`app/lib/fx/`=FX版）
- 株式分析エンジンとFX分析エンジンのロジックを混在させない（片方の修正でもう片方を変更しない）
- AI雑学YouTube（`/Volumes/ESD-EHB/AI雑学YouTube`）の作業はここでは行わない
- 他プロジェクトのディレクトリへcdして作業しない
- 対象範囲（株版かFX版か）が曖昧な依頼が来たら、作業前にどちらのセッションかを確認する

## 基本ルール

- 説明は日本語
- 初心者にも分かるように説明
- 大きな変更前は必ず内容を説明する
- 削除前は必ず確認する
- 既存コードを壊さない
- コメントは日本語

## セキュリティ

- APIキーを表示しない
- .env.local を変更しない
- .env.local をGitへコミットしない
- Git Push前は必ず確認する
- 外部アップロード前は必ず確認する

## Git

- コミット前に変更内容を要約する
- 危険なコマンドは理由を説明してから実行する

## 動画

- 元動画は削除しない
- コピーを作成して編集する

## コーディング

- TypeScriptを優先
- Next.jsのベストプラクティスに従う
- 可読性を重視する
