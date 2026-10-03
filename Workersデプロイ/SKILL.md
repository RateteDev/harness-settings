---
name: Workersデプロイ
description: |
  Cloudflare Workersへ安全に公開するためのデプロイスキル。Workers BuildsでVersionだけをアップロードし、Preview URLを検証してから、確認済みVersionをProductionへPromoteする構成と手順を扱う。Static Assetsを使うフロントエンドとWorker APIの両方を対象とする。
---

# Cloudflare Workersデプロイガイド

永続アカウントのCloudflare Workersを、Git pushとProduction反映を分離して公開するための方針を定める。

## 構成

| 実行場所 | 担う操作 |
|---|---|
| 開発端末 | 認証不要のdry runだけ。Cloudflare認証情報を置かない |
| GitHub Actions | Cloudflare認証が不要なlint・test・build。認証情報は渡さない |
| Workers Builds | Version uploadとPreview aliasの更新。認証情報はこの経路に閉じる |
| ユーザー（Dashboard） | Production Promote、rollback、例外的な管理操作 |

## 目的

- pushしてもProductionは変わらない。deploy commandは`wrangler versions upload --preview-alias preview`相当とし、Versionを作るだけでtrafficを流さない
- push（エージェント）とPromote（ユーザー）が分かれるため、検証済みVersionだけがProductionへ上がる
- Cloudflare認証情報が端末とGitHubに存在しない。書き込み権限を持つ実行面をCloudflare側へ限定する

## 規則

- Production branchでも`wrangler deploy`を使わない。即座に100%のtrafficを流す
- エージェントはProduction trafficを変更しない。PromoteとrollbackはユーザーがDashboardで行う
- 失敗時もPreview経路を迂回しない。例外は影響をユーザーへ提示して個別に承認を得る
- Workerの初回作成だけは`wrangler deploy`相当が必要になり得る。Dashboardからの作成など、影響を確認した経路で行う
- storage・secret・trigger・Durable Object migrationの変更はVersionに含まれない。rollbackやPreview検証はcode変更にしか効かないと考え、data migrationは別作業として扱う
- Version IDでcommit・build・Preview・Promote対象を照合する

## 例

Workers Buildsのbuild commandとdeploy commandの例である。実値は対象リポジトリの正本に従う。

```sh
# build command
bun x tsc --project apps/<app>/tsconfig.json && cd apps/<app> && bun x vite build

# deploy command
bun x wrangler versions upload --preview-alias preview --config apps/<app>/wrangler.jsonc
```
