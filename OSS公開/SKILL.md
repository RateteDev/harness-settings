---
name: OSS公開
description: リポジトリをOSSとして公開するときに使う。public化、OSS化、公開準備の依頼で使い、秘密情報・端末情報、権利関係、再現性の公開前チェックと、README形式の確認、公開操作とリリースを扱う。
---

# OSS公開

リポジトリをOSSとして公開する作業である。
次の段階をこの順で行う。

1. 公開前チェック — [references/preflight.md](references/preflight.md)
2. README — [references/readme.md](references/readme.md)
3. 公開 — [references/publish.md](references/publish.md)
4. リリース — [references/release.md](references/release.md)

READMEとリリースノートの仕上がりは [references/output-example.md](references/output-example.md) の見本に合わせる。
書き終えたら見本と並べて点検する。

本スキルが定義する段階は、公開前チェック・README・公開・リリースである。
定義の無い作業をユーザーが求めた場合は、作業に入る前に本スキルへ規則を追加する。

## 共通規則

- 本文の既定言語は日本語とし、ユーザーから指定があった場合だけ別の言語で書く。
- 秘密情報を検出しても、値そのものを出力せず、場所と種類だけを報告する。
- 実アカウントや実機での確認はエージェントが実行できないため、ユーザーへ依頼する。

## Pages

Pagesで公開するコンテンツがまだ無いため、Pagesの段階は本スキルに定義していない。
ユーザーからPagesの公開を求められた場合は、作業に入る前に本スキルへPagesの規則を追加し、`references/pages.md`として段階を定義する。
