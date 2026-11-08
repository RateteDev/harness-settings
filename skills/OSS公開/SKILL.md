---
name: OSS公開
description: リポジトリをOSSとして公開するときに使う。public化、OSS化、公開準備の依頼で使い、秘密情報・端末情報、権利関係、再現性の公開前チェックと、README形式の確認、公開操作とリリースを扱う。
metadata:
  user-review: false
---

# OSS公開

## 目的
公開後の取り消しが困難な「機密情報・ライセンス侵害・環境再現性」のリスクを未然に防ぎ、所定のステップに沿って安全にリポジトリを公開・リリースする。

## 実行フロー
以下の順序で作業を進めること。
各ステップの詳細はリンク先の仕様に従う。

1. **公開前チェック**: [references/preflight.md](references/preflight.md)
   - 機密情報、ライセンス、動作再現性の事前確認。
2. **README整備**: [references/readme.md](references/readme.md)
   - 必要な項目を網羅したREADMEの作成・更新。
3. **リポジトリ公開**: [references/publish.md](references/publish.md)
   - 可視性（Public）の変更とリポジトリ設定。
4. **リリース**: [references/release.md](references/release.md)
   - タグ打ちおよびリリースノートの作成。

※ READMEおよびリリースノートの書式・トーンは [references/output-example.md](references/output-example.md) を基準とし、作成後に必ず見本と照合すること。

---

## 共通ルール

- **使用言語**: 原則として**日本語**を使用する（ユーザーから明示的な指定がある場合を除く）。
- **機密情報の保護**: APIキーやパスワードなどを検出した場合、**値そのものは絶対に出力せず**、「該当ファイル・行数」と「種別（例: AWS Secret Key）」のみを報告する。
- **実環境での確認**: エージェント自身で実行できない認証や実機テストは、手順を整理してユーザーへ実行を依頼する。
- **未定義のタスク**:
  - 本フローに含まれない作業を求められた場合、作業へ入る前に本ファイル（スキル定義）へルールを追記してユーザーの承認を得ること。
  - **GitHub Pagesの公開**: 現状は対象外。
    依頼があった場合は `references/pages.md` を作成・定義した上で作業に着手する。
