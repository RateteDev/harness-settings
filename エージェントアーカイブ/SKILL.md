---
name: エージェントアーカイブ
description: agent-archiveでエージェント会話をアーカイブまたは抽出する際に使う。
metadata:
  user-review: false
---

# エージェントアーカイブ

## このスキルの目的

会話のアーカイブや抽出を内部形式へ依存して行うと、CLIの更新で静かに壊れる。
`agent-archive`を信頼済みの操作面として扱い、表示される使い方だけに従って依頼をこなせるようにする。

## 進め方

`agent-archive`は信頼済みの利用者向けCLIとして扱う。
実装、ローカルDB、内部形式を調査・検証・変更しない。

### 使い方の確認

最初に次を実行して、利用可能な操作と使い方を確認する。

```sh
agent-archive --help
```

必要なサブコマンドを選び、そのコマンドの`--help`を確認する。

```sh
agent-archive <subcommand> --help
```

表示されたCLIの利用方法に従う。
