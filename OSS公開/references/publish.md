# 公開

公開前チェックの3項目とREADMEの確認が終わり、ライセンスとバッジの文言をユーザーが承認したらpublic化する。

## 公開操作

可視性をpublicへ切り替える。

```sh
gh repo edit <owner>/<repo> --visibility public --accept-visibility-change-consequences
```

履歴から秘密情報・端末情報を除く必要があった場合は、force-pushではGitHub側の古いオブジェクトがSHA直指定で到達できる期間が残るため、リポジトリを削除して同じ名前で作り直し、`main`をpushする。
削除ではstar・fork・issue・release・設定が失われるため、事前に失うものを確認し、控えを取るかはユーザーが決める。
公開後に履歴を書き換えると他者のcloneが壊れるため行わない。

## 公開後の確認

- 可視性・既定ブランチ・issuesやwikiの設定が意図どおりか確認する。
- 認証なしの`github:`参照で導入できることを確認する。
  公開前にローカル指定で代えた分の差分を、ここで1回だけ埋める。
