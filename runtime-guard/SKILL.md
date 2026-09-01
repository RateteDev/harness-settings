---
name: runtime-guard
description: |
  OpenCodeからのpackage manager直接実行をPermission hookで抑止し、Bun・uvへ誘導するpolicyを管理するスキル。
  TRIGGER when: 抑止するcommand、代替command、deny message、Permission hookの判定方法を変更する場合。
  DO NOT TRIGGER when: 通常の依存導入でguardに拒否された場合。拒否理由と代替commandはtool errorが案内する。
---

# Runtime policy

`plugins/runtime-guard/`が実装とtestを所有する。OpenCode Coreのshell scannerが複合commandをcommand resourceへ分解した後、Permission hookが直接実行を判定する。

PATHの差し替え、同名のwrapper、`real-*`迂回commandは作らない。このpolicyはエージェントの誤操作を防ぐものであり、意図的なshell迂回に対するsecurity boundaryではない。

## 変更方法

抑止対象と代替commandは`plugins/runtime-guard/policy.ts`だけで変更する。hook登録は`plugins/runtime-guard/index.js`、判定testは`plugins/runtime-guard/tests/unit/`に置く。

変更後はplugin directoryで次を実行する。

```sh
just test
```

OpenCode自身のshell構文解析をplugin側へ複製しない。scannerの挙動を確認する必要がある場合は、OpenCode Coreの`packages/core/src/shell/parse.ts`と対応するtestを参照する。
