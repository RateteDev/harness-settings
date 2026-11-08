---
name: レポジトリ規約・セットアップ
description: |
  リポジトリの開発基盤を構築・監査するスキル。ディレクトリ骨格・justfile・CI・Gitフックの規約、雛形、機械検査とエージェント検査を持つ。
metadata:
  user-review: false
---

# レポジトリ規約・セットアップ

## このスキルの目的

リポジトリごとに開発基盤を手作りすると、規約と検査の内容がずれ、作業の前提がリポジトリ間で変わる。
骨格・justfile・CI・Gitフックの規約と雛形を共通化し、機械検査と監査で差分を検出できるようにする。

## 進め方

作業に応じて次のリファレンスを読む。

| 何をするか | 読むもの |
|---|---|
| 開発コマンドを定義・変更する | `references/justfile.md` |
| CIを構成する | `references/ci.md` |
| 既存リポジトリを監査する | `references/audit.md` |

### 新規リポジトリの立ち上げ

`templates/`に雛形一式がある。
対象リポジトリへ配置し、プレースホルダを埋める。

| 雛形 | 役割 |
|---|---|
| `justfile` | 開発コマンドの入口 |
| `.github/workflows/ci.yaml` | リモートCI |
| `mise.toml` | ツールチェーン版数。ここが唯一の宣言で、CIもこれを読む |
| `.githooks/` | commit-msg / pre-commit / pre-push |
| `.gitignore` | 一般的な除外設定 |
| `AGENTS.md` | エージェント指示書。雛形と書き方はAGENTS.md規約スキルの`templates/AGENTS.md`が持つ |

ディレクトリ骨格は雛形に含めないため、配置とあわせて作成する。

```text
apps/        アプリケーションの入口
packages/    共有ライブラリと内部パッケージ
assets/      静的アセット
data/        データファイル
docs/adr/    設計判断の記録
docs/spec/   仕様書
infra/       製品のデプロイに必要な構成
```

配置後に`git config core.hooksPath .githooks`を実行し、フックを有効化する。

雛形は言語・スタックを固定していない。
`justfile`とCIの中身はプロジェクトに合わせて書き換えてよいが、recipe名とjob構成は規約に従う。

### 機械強制される規約

`commit-msg`フックがコミットメッセージを機械検査する。
件名・本文構成・一文一行の行末・文字数の規約はコミット規約が持つ。
手元で落ちた場合はメッセージ側を直し、フック側を緩めない。

このフックは全リポジトリで同一内容を保つ。
規約を変えたら雛形を直し、各リポジトリへは雛形をそのまま上書きして配る。
配り漏れは同梱のaudit scriptが雛形との一致検査で検出する。

`pre-commit`フックは、変更されたpathに応じたアプリ検査に加えて、`repo-checks`を無条件に走らせる。
リポジトリ横断の不変条件はどのアプリにも属さず、path条件では選ばれないためである。
CIも同じrecipeを呼び、検査内容をjustfileの一箇所に置く。

`mise.toml`がツールチェーン版数の唯一の宣言である。
CIは`jdx/mise-action`で同じファイルを読み、`env`にも`with:`にも版数を書かない。
同じ版数が2箇所にあると、一致を規約で義務付けても嘘をつける場所が残る。
同梱のaudit scriptは、workflowが版数リテラルや`*_VERSION`を持つことと、setup系actionがmiseと並んでいることを検出する。

recipeの説明は`just --list`に出る一行である。
`just --list`は直前のcomment blockの最終行だけを拾うため、理由を複数行書く場合は`[doc]`で説明を明示し、commentは理由の記録として残す。
`just --list`はコマンドの唯一の発見面であり、そこが断片で埋まると発見できない。
同梱のaudit scriptは、複数行commentを持ちながら`[doc]`を持たないrecipeを検出する。

### 既存リポジトリの監査

次を実行する。
以下の`SKILL_ROOT`は、このスキルを読み込んだときにハーネスが示すスキルのディレクトリである。

```sh
"${SKILL_ROOT}/scripts/audit.sh" --repo <path>
```

scriptは機械検査の結果に続けてエージェント検査のguideを出力する。
終了statusにかかわらず、その指示に従ってguideの全項目を確認し、機械検査と統合した結果を報告する。
問題は無断で修正せず、修正内容を具体化して新しい`GO`を待つ。
