---
name: Workersデプロイ
description: |
  Cloudflare Workersへ安全に公開するためのデプロイスキル。Workers BuildsでVersionだけをアップロードし、Preview URLを検証してから、確認済みVersionをProductionへPromoteする構成と手順を扱う。Static Assetsを使うフロントエンドとWorker APIの両方を対象とする。
metadata:
  user-review: false
---

# Workersデプロイ

## 目的

Git pushと本番反映（Promote）を分離し、Preview URLで動作確認したVersionのみを安全にProductionへ公開する。
また、開発端末やGitHub ActionsにCloudflareの書き込み権限を持たせないセキュアな構成を維持する。

## 役割分担

| 実行場所 | 役割 | Cloudflare認証情報 |
|---|---|---|
| 開発端末 | 認証不要のdry run・ローカル開発 | 持たせない |
| GitHub Actions | lint・test・型チェック | 持たせない |
| Workers Builds | Version作成（upload）とPreview更新 | Cloudflare側で完結 |
| ユーザー（Dashboard） | ProductionへのPromote、ロールバック | 各自のアカウント権限 |

## 運用ルール

### 必須事項 (DO)
- **Version uploadの徹底**: デプロイコマンドは `wrangler versions upload --preview-alias preview` 相当とし、Version作成とPreview更新にとどめる。
- **Version IDによる照合**: コミット、ビルド、Preview、Promote対象はすべてVersion IDで突き合わせる。
- **設定変更の分離**: Storage（KV/D1/R2）、Secret、Trigger、Durable Object MigrationはVersion管理の対象外となるため、コード変更とは切り離して個別に扱う。

### 禁止事項 (DO NOT)
- **`wrangler deploy` の実行禁止**: 即座に本番トラフィックが切り替わるため、本番ブランチであっても使用しない（初回Worker作成時など、影響を確認済みの例外を除く）。
- **エージェントによる本番反映の禁止**: ProductionへのPromoteやロールバックは、必ずユーザー自身がCloudflare Dashboardから手動で実行する。
- **Preview検証のスキップ禁止**: トラブル時でもPreviewを経由しない直接反映は行わない。
  例外が必要な場合は必ずユーザーの事前承認を得る。

## 設定例 (Workers Builds)

リポジトリ構成や使用パッケージマネージャーに応じて適宜調整してください。

```sh
# build command
bun x tsc --project apps/<app>/tsconfig.json && cd apps/<app> && bun x vite build

# deploy command
bun x wrangler versions upload --preview-alias preview --config apps/<app>/wrangler.jsonc
```
