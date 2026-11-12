---
name: Workersデプロイ
description: |
  Cloudflare Workersへ安全に公開するためのデプロイスキル。Workers BuildsでVersionだけをアップロードし、Preview URLを検証してから、確認済みVersionをProductionへPromoteする構成と手順を扱う。Static Assetsを使うフロントエンドとWorker APIの両方を対象とする。
metadata:
  user-review: false
  labels: [規約]
---

# Workersデプロイ

## 目的

Git pushによる本番（Production）への直接反映を禁止し、検証漏れや認証情報の漏洩を防ぐ。
「Versionの作成・プレビュー」と「本番反映（Promote）」を分離し、安全にリリースできる体制を維持する。

## 運用原則

### 1. 実行環境と権限の分離

Cloudflareの書き込み権限を持つ環境をWorkers Buildsに限定し、ローカル端末やGitHub Actionsには認証情報を置かない。

| 実行環境 | 担当する操作 |
|---|---|
| 開発端末 | 認証不要のdry run |
| GitHub Actions | 認証不要のlint・test・build |
| Workers Builds | Versionの作成・アップロード、Preview aliasの更新 |
| ユーザー（Dashboard） | 本番反映（Promote）、ロールバック、初回作成などの管理操作 |

### 2. 本番反映の制限（エージェントへの制約）

- **エージェントは本番トラフィックを変更してはならない。**
- `wrangler deploy` の使用を禁止する（即座に全トラフィックが切り替わるため）。
- pushをトリガーとするWorkers Buildsのデプロイコマンドには、必ず `wrangler versions upload --preview-alias preview` を使用する。
- 本番反映（Promote）およびロールバックは、Preview URLでの検証後、**ユーザー自身がCloudflare Dashboard上で実行する**。
- 例外対応やWorkerの初回作成（Dashboardでの作成など）が必要な場合は、影響をユーザーに説明した上で承認を得る。

### 3. バージョン管理の対象外

以下のリソース変更やデータ移行はVersion管理に含まれず、ロールバックも効かない。コードの変更とは切り離し、個別に作業する。

- ストレージ（KV, D1, R2）
- シークレット（環境変数）
- トリガー（Cron Triggersなど）
- Durable Objectsのマイグレーション

## デプロイ手順

1. **Version作成（push）**
   - コードをpushし、Workers Buildsを起動する。
   - `versions upload` により新しいVersionが作成され、Preview aliasが更新される。
2. **プレビュー検証**
   - Preview URLで動作を検証する。
   - コミット・ビルド・プレビュー対象のVersion IDが一致していることを確認する。
3. **本番反映（ユーザーへの依頼）**
   - エージェントは検証済みのVersion IDをユーザーに伝える。
   - ユーザーがDashboard上で対象VersionをProductionへPromoteする。

## 設定例（Workers Builds）

※ 実際の設定値は対象リポジトリの構成に合わせて調整すること。

```sh
# build command
bun x tsc --project apps/<app>/tsconfig.json && cd apps/<app> && bun x vite build

# deploy command（deployではなくversions uploadを使用）
bun x wrangler versions upload --preview-alias preview --config apps/<app>/wrangler.jsonc
```
