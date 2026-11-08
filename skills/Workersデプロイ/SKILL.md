---
name: Workersデプロイ
description: |
  Cloudflare Workersへ安全に公開するためのデプロイスキル。Workers BuildsでVersionだけをアップロードし、Preview URLを検証してから、確認済みVersionをProductionへPromoteする構成と手順を扱う。Static Assetsを使うフロントエンドとWorker APIの両方を対象とする。
metadata:
  user-review: false
  labels: [規約]
---

# Workersデプロイ

## このスキルの目的

Git pushをそのままProductionへ反映すると、検証前の変更が利用者へ届き、Cloudflareの書き込み認証情報を端末やGitHubへ置く必要も生じる。
永続アカウントのCloudflare Workersで、Versionの作成とPromoteを分離し、Preview URLで検証したVersionだけをProductionへ反映できる状態を作る。

## あるべき状態

### 実行場所と認証情報

| 実行場所 | 担う操作 |
|---|---|
| 開発端末 | 認証不要のdry run |
| GitHub Actions | Cloudflare認証が不要なlint・test・build |
| Workers Builds | Version uploadとPreview aliasの更新 |
| ユーザー（Dashboard） | Production Promote、rollback、例外的な管理操作 |

- Cloudflareの認証情報は開発端末とGitHubに無く、書き込み権限を持つ実行面はWorkers Buildsに閉じている。

### Productionへの反映

- Production branchを含め、pushしてもProductionは変わらない。
  Workers Buildsのdeploy commandは`wrangler versions upload --preview-alias preview`相当で、Versionを作りPreview aliasを更新するだけである。
  `wrangler deploy`は即座に100%のtrafficを新しいVersionへ流すため、deploy commandは`versions upload`に限っている。
- Productionへの反映（Promote）とrollbackは、Preview URLで検証したVersionに対してユーザーがDashboardで行っている。
  エージェントはProduction trafficを変えない。
- 失敗時もPreview経路を通している。
  例外が要る場合は、影響をユーザーへ示して個別に承認を得ている。
- Workerの初回作成だけは`wrangler deploy`相当が要り得るため、Dashboardからの作成など、影響を確かめた経路で行われている。
- commit・build・Preview・Promote対象は、Version IDで照合されている。

### Versionに含まれない変更

- storage（KV・D1・R2）・secret・trigger・Durable Object migrationの変更とdata migrationは、code変更とは別の作業として扱われている。
  これらはVersionに含まれず、Preview検証やrollbackが効かないためである。

## 守る順序

1. pushし、Workers BuildsにVersionを作らせてPreview aliasを更新させる。
2. Preview URLで動作を検証し、検証したVersionのVersion IDをcommit・buildと照合する。
3. 検証したVersion IDをユーザーへ伝え、ユーザーがDashboardでPromoteする。
   Production trafficの切り替えは利用者へ即座に届くため、検証とユーザーの判断を経てから行う。

## 手段

Workers Buildsのbuild commandとdeploy commandの例である。
実値は対象リポジトリの正本に従う。

```sh
# build command
bun x tsc --project apps/<app>/tsconfig.json && cd apps/<app> && bun x vite build

# deploy command
bun x wrangler versions upload --preview-alias preview --config apps/<app>/wrangler.jsonc
```
