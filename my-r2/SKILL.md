---
name: my-r2
description: R2バケットへのアップロード・ダウンロード・一覧・ディレクトリ同期・削除を、AWS CLIを包んだ薄いラッパー`my-r2`で行う。R2に関するファイル操作を依頼されたとき、または自分でR2のファイルを扱いたいときに使う。
---

# my-r2

R2バケットへのファイル操作を行うラッパーCLI。裏ではAWS CLI(`aws s3`)を呼び、バケット名とエンドポイントは`R2_*`環境変数から読み込む。呼び出し側はバケット名を書かず、R2側のキー(スラッシュ区切りのパス)だけを渡す。

`my-r2`自体は`skills/my-r2/my-r2.sh`に置かれ、`~/.local/bin/my-r2`から使う。

## 環境変数

`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT_URL` / `R2_BUCKET` が必要。`R2_SECRET_ACCESS_KEY`は値そのものを出力・保存・会話へ貼り付けない。

## サブコマンド

```sh
my-r2 put  <local> <key>       # アップロード (local を R2 の key へ)
my-r2 get  <key> <local>       # ダウンロード (R2 の key を local へ)
my-r2 ls   [prefix]            # 一覧 (prefix は省略可)
my-r2 sync <local-dir> <key>   # ディレクトリ同期 (ローカル→R2 のアップロード方向)
my-r2 rm   <key>               # 削除
my-r2 help                     # ヘルプ (`--help` / `-h` でも可)
```

方向は動詞で決まる。`put`は上げる、`get`は下げる。`cp`のように引数の順序から推測する必要がない。

## 使用例

```sh
my-r2 put  ./photo.png docs/photo.png
my-r2 get  docs/photo.png ./photo.png
my-r2 ls   docs/
my-r2 sync ./assets docs/assets
my-r2 rm   docs/old.png
```

R2側のキーはバケット名を含めず、`docs/photo.png`のように書く。

## 注意

- このラッパーには秘密値を埋め込んでいない。`R2_*`は秘密ファイルから読み込む(正本はグローバルAGENTS.mdの秘密規約どおり)。
- `R2_SECRET_ACCESS_KEY`などの値はログや出力へ出さない。`aws`のエラーはそのまま表示されるが、認証情報を含む行は出さない。
- 大容量ファイルはAWS CLIがmultipartへ自動切替えする。閾値や動作が既定でよい場合はオプションを付けずに使う。
