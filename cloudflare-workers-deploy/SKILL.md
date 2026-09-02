---
name: cloudflare-workers-deploy
description: |
  Cloudflare Workersへ安全に公開するためのデプロイスキル。Workers BuildsでVersionだけをアップロードし、Preview URLを検証してから、確認済みVersionをProductionへPromoteする手順を扱う。Static Assetsを使うフロントエンドとWorker APIの両方を対象とする。
  TRIGGER when: Cloudflare Workersへのデプロイ、Workers Buildsの設定、Version Previewの検証、Production Promoteを行う場合。
  DO NOT TRIGGER when: Cloudflare Pagesをデプロイする場合、Cloudflare Tunnelでローカルサーバーを公開する場合、一時アカウントへ試作を公開する場合。
---

# Cloudflare Workersデプロイ

永続アカウント上のCloudflare Workersを、Git連携のWorkers BuildsとVersions & Deploymentsで公開する。GitへのpushとProductionへの反映を分離し、検証したVersionだけをProductionへ昇格する。

## 中核契約

- **VersionのuploadとProduction deploymentを分離する。** Workers BuildsのProduction branchでも`wrangler deploy`を使わない。`wrangler deploy`は新しいVersionを作り、そのVersionへ即座に100%のtrafficを流す
- **GitへのpushではPreviewだけを更新する。** deploy commandには、リポジトリの実行環境に合わせた`wrangler versions upload --preview-alias preview`相当を設定する
- **ProductionへのPromoteはユーザーがDashboardで行う。** エージェントは確認済みVersion IDを案内するが、`wrangler versions deploy`やDashboard操作でProduction trafficを変更しない
- **Version IDを成果物として扱う。** commit、build、Preview URL、ProductionへPromoteするVersionが同一であることをVersion IDで照合する
- **失敗時に`wrangler deploy`へ切り替えない。** Preview経路の失敗を直し、Productionの安全策を迂回しない

## 脅威モデルと実行境界

開発端末とGitHub ActionsへCloudflare認証情報を配布しない。エージェントが操作できるCLIやrepository-controlled workflowに永続アカウントのremote write権限を与えず、次の境界を維持する。

| 実行場所 | 許可するCloudflare操作 | 理由 |
|---|---|---|
| 開発端末 | 認証不要でremote writeを行わないdry run | 端末へ認証情報を置くと、その端末上のエージェントや任意のprocessがCloudflare APIを操作できるため |
| GitHub Actions | Cloudflare認証を必要としないlint、test、buildなどのCI | Cloudflare API tokenをGitHub Actions secretsへ保存してworkflowへ渡すと、秘密の保管先と漏洩可能な実行面が増えるため |
| Workers Builds | Version uploadとPreview aliasの更新 | Cloudflare認証情報をCloudflare側のdeployment経路へ閉じ込め、開発端末とGitHubへ配布しないため |
| Cloudflare Dashboard | ユーザーによるProduction Promote、rollback、例外的な管理操作 | エージェントが利用できるCLIとGit操作だけではProduction trafficを変更できない境界を保つため |

開発端末では`wrangler login`を行わず、`CLOUDFLARE_API_TOKEN`などのCloudflare認証情報を環境変数や認証storeへ置かない。Wranglerの利用自体は禁じないが、`--dry-run`によるcompileと検査だけに限定する。`wrangler deploy`、dry runでない`wrangler versions upload`、`wrangler versions deploy`、`wrangler triggers deploy`、secretやstorageを変更するcommandは開発端末で実行しない。

GitHub Actionsの利用自体も禁じない。Cloudflare認証情報を渡さないCIには利用できるが、Cloudflareへのupload、deploy、secret変更、resource変更には利用しない。

Workers Buildsもrepository-controlled commandを実行し、内部でAPI tokenを使うため、漏洩リスクがなくなるわけではない。この構成の目的は秘密をなくすことではなく、保管先と権限を持つ実行面をCloudflare側へ限定することである。Workers Buildsのbuild commandとdeploy commandは必要最小限にし、API tokenにはCloudflareが許す範囲で最小権限のcustom tokenを使う。自動生成tokenを使う場合も、その時点の権限範囲を確認する。

## 正本と入力

値を推測したり、このスキルへプロジェクト固有値を保存したりしない。作業開始時に次を確認する。

| 対象 | 正本 |
|---|---|
| Worker名、Wranglerの版、Worker設定、build成果物 | 対象リポジトリ |
| Git repository、Production branch、root directory、build command、deploy command | Cloudflare DashboardのWorkers Builds設定 |
| ProductionとPreviewのdomain・route | 対象リポジトリが指定する正本。Dashboardを正本とするプロジェクトではリポジトリへ複製しない |
| Workers BuildsのAPI token、build secret、runtime secret | Cloudflare Dashboard。値を表示、記録、会話へ出力しない |
| ローカル検査の入口 | 対象リポジトリのtask runnerまたはCI設定 |

Dashboardで確認できる状態は、古い文書やURLの命名規則から推測しない。Worker名はDashboardとWrangler設定で一致している必要がある。

## Workers Buildsの構成

新規構成または設定変更では、次を満たす。

1. Wrangler `4.21.0`以上を対象リポジトリの依存として固定し、Workers Buildsでもその版を使う。`--preview-alias`を使わない構成でも、リポジトリが固定した版を使う。
2. Wrangler設定で`preview_urls`を明示する。Version Previewを使う本手順では`true`とする。
3. `workers_dev`はProductionのrouting方針に合わせて明示する。`preview_urls`の代替として扱わない。
4. Production branchのdeploy commandを`wrangler versions upload --preview-alias preview`相当にする。Dashboard上の項目名がdeploy commandでも、実行内容はuploadに限定する。
5. non-production branch buildを使う場合も、deploy commandを`wrangler versions upload`相当にする。不要ならbranch build自体を無効にする。
6. monorepoではroot directory、build command、Wrangler configの解決位置が一致することを確認する。
7. build commandはProductionと同じ成果物を作る。検査とbuildの実体はリポジトリのtask runnerへ置き、Dashboardへ長い処理を複製しない。

`preview` aliasは常に最新のupload済みVersionを指す安定URLを作る。個別の検証結果はaliasだけで識別せず、Version IDとversioned Preview URLも記録する。

Workers Buildsを初めて接続する場合は、設定保存だけで既存Productionへ影響しないかをDashboardで確認する。初回のWorker作成は後述の例外に従う。

## デプロイ手順

### 1. ローカル検査

対象リポジトリの既定コマンドでlint、test、型検査、Production buildを完了する。その後、Cloudflare認証情報が存在しないことを値を表示せずに確認し、Workers Buildsが実行するuploadと同じWrangler設定・environment・working directoryで次のdry runを行う。

```sh
wrangler versions upload --dry-run --preview-alias preview
```

実際の呼び出しにはリポジトリ固定のWranglerと、必要な`--config`、`--cwd`、`--env`を使う。上のコマンドをそのまま実行することを意味しない。

### 2. Workers Buildsを起動

ユーザーが承認したGit操作だけを行う。別の作業者による変更をcommitへ混ぜない。対象commitをpushした後、Workers Buildsの完了を待つ。

buildを照合するときは「最新」という位置だけを信用しない。Git commit SHA、branch、build時刻、Version IDを確認し、並行buildの結果と取り違えない。

### 3. Previewを検証

build成功後に次を取得する。

- Version ID
- versioned Preview URL
- `preview` aliasのPreview URL
- 対応するGit commit SHA

aliasが新しいVersionを指していることを確認してから、変更対象の完全なURLを検証する。トップページだけで代用しない。

Static Assetsでは、変更ページの応答、主要assetのload、SPA fallbackなど変更に関係する経路を確認する。Worker APIでは、変更endpointのstatus、header、response body、認証境界を確認する。書き込みを伴う検証は、Previewが参照するstorageを確認してから行う。

Preview URLは既定では公開され得る。非公開データや管理機能を含む場合はCloudflare Accessなどの保護を確認し、保護がなければ公開URLでの検証を中止する。

### 4. Previewを報告

次をユーザーへ報告する。

```text
Version ID: <id>
Source commit: <sha>
Preview: <変更対象まで含む完全なURL>
Checks: <実施した検査>
Production: unchanged
```

Production反映を依頼されている場合は、Cloudflare Dashboardの対象Workerにある`Deployments`から`Promote deployment`を選び、報告したVersion IDを100%へPromoteするよう案内する。エージェントはここでユーザーの操作完了を待つ。

### 5. Productionを検証

ユーザーがPromote完了を伝えた後、Dashboardで対象Versionが100%を受けていることを確認する。続いて変更対象まで含むProduction URLを検証し、Version ID、Production URL、検査結果を報告する。確認のために開発端末へCloudflare認証を追加しない。

## 通常経路を使えない場合

次の場合は安全策を迂回せず、影響と代替経路をユーザーへ提示して個別の承認を得る。

| 状況 | 対応 |
|---|---|
| Workerの初回作成 | 最初のuploadには`wrangler deploy`相当が必要で、即時deploymentになり得る。ユーザーがDashboardから作成するか、影響を確認した一度限りのWorkers Builds設定で実行し、開発端末へ認証を追加しない |
| route、custom domain、Cron Triggerの変更 | `versions upload`だけでは反映されない。`wrangler triggers deploy`がProduction routingへ与える影響を分離して確認する |
| Durable Object migration | `versions upload`ではclass lifecycle変更を適用できない。migrationとcode deploymentを分けて計画する |
| Durable ObjectsまたはContainersを使うWorker | Version Preview URLが生成されない。別Workerやenvironmentなどのstaging経路を設計し、Previewを省略してProductionへ直行しない |
| Containers | `versions upload`ではcontainer imageを更新しない。CloudflareのContainers向けrollout手順を別途確認する |
| KV、R2、D1、Durable Objectsなどの状態変更 | Worker Versionにはstorage状態が含まれない。rollback可能と見なさず、data migrationを別作業として扱う |
| secretまたはbindingの変更 | codeだけのdeploymentへ混ぜない。PreviewとProductionの参照先、およびVersion作成・即時反映の有無を確認する |

Productionで問題を確認しても、自動でrollbackしない。直前のdeploymentに含まれるVersion IDと、storageやtriggerに残る非Version管理の変更を確認してユーザーへ報告し、ユーザーがDashboardでrollbackする。

例外経路でWranglerによるremote writeが必要になっても、開発端末での実行を許可したことにはならない。Cloudflare Dashboardまたは目的を限定したWorkers Builds経路を使い、Productionへの影響を個別に確認する。

## 公式資料

Workers Buildsの設定または例外経路を変更する場合は、実行前に現在の公式資料を確認する。

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Versions & Deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Deployment management](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/)
- [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Wrangler Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
