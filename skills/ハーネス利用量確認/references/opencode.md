# OpenCode Go

## 知りたいことに応じて見る場所

| 知りたいこと | 見る場所 |
| --- | --- |
| 共通枠の残量とリセット時刻 | `scripts/opencode-go-usage.sh` |
| モデル別のトークン単価・月間上限・推定リクエスト | `https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/content/docs/go.mdx` |
| モデルの重み | 同ファイルのMonthly limit列から `60 ÷ 値` |
| 正しいモデルID | `GET https://opencode.ai/zen/go/v1/models` |
| 重みのDB実値（使ったモデルのみ） | `https://opencode.ai/workspace/<id>/go` の内訳表Quota列 |

スクリプトは `GET https://opencode.ai/zen/go/v1/usage` を呼び出す。

```sh
OPENCODE_GO_API_KEY="$OPENCODE_GO_API_KEY" scripts/opencode-go-usage.sh
```

キーは対話的に渡すか、コマンド実行時だけ `OPENCODE_GO_API_KEY` を設定する。
設定ファイル、シェル履歴、スキル、チャットへキーを書かない。
このエンドポイントは公開APIリファレンスに無く、応答が変わったらコンソールで確認する。

## 背景

利用量はアカウント共通の3ウィンドウ（5時間・週・月）に1組だけあり、次の重みで加重されて消費される。
会計と上限判定も共通の3列と3上限だけで行われ、モデル別のゲートは無い。

```
重み = プランの月間上限 ÷ モデルの月間上限
quota消費 = ドル消費 × 重み
```

コンソールのモデル別 `used / quota` 行は「共通上限 ÷ 重み」の表示専用値で、docsの月間上限列はこれに対応するため、docsからも重みが導ける。
モデル名は数日で入れ替わるため、一覧は必ずdocsから取る。

`/v1/usage` の `percent` は共通枠の加算済み消費率で、`?model=` は無視される。
`monthly` は月初ではなく請求サイクル基準で、`resetsAt` がそのままリセット時刻になる。
docsは「モデルごとに独立した上限」と書いているが実装は共有1箱で、`multiplier` / `weight` の語はdocsに一度も登場しない。
