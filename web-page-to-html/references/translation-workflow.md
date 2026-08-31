# 翻訳workflow

## 1. 抽出

```bash
"${SKILL_ROOT}/scripts/extract-texts.py" \
  "<WORK_DIR>/standalone.html" \
  "<WORK_DIR>/texts.json"
```

`texts.json`は`[{"id": 1, "text": "..."}]`の形になる。`<main>`内の英語中心のtext nodeだけが対象であり、`script`、`style`、`noscript`、`svg`、`button`は除外される。

## 2. 現在のagentによる翻訳

現在のagentが`texts.json`を読み、次の形の`translations.json`を書く。

```json
[
  {"id": 1, "translated": "翻訳文"}
]
```

- すべてのIDを1回ずつ含める。
- 製品名、会社名、user nameなどの固有名詞は原表記を保つ。
- 逐語訳ではなく、周囲のsegmentも踏まえて自然な文にする。
- 固有名詞だけの短いsegmentは変更しない。
- HTML tagやentityではなく、表示するplain textを書く。
- 件数が多ければID範囲で分割して処理し、最後に1つのJSON arrayへまとめる。

翻訳を別のCLIへ委譲しない。これにより、sessionで選択中のprovider/modelをそのまま利用する。

## 3. 原文との結合

```bash
"${SKILL_ROOT}/scripts/merge-translations.py" \
  "<WORK_DIR>/texts.json" \
  "<WORK_DIR>/translations.json" \
  "<WORK_DIR>/translated.json"
```

IDの欠落、重複、余分なID、空の翻訳があれば非zeroで停止する。

## 4. HTMLへ適用

```bash
"${SKILL_ROOT}/scripts/apply-translation.py" \
  "<WORK_DIR>/standalone.html" \
  "<WORK_DIR>/translated.json" \
  "<WORK_DIR>/translated.html" \
  "<TARGET_LANG>"
```

`TARGET_LANG`には`ja`などのBCP 47 language tagを渡す。`MISS`が1件でもあれば非zeroとなるため、原HTMLとJSONの対応を直してから再実行する。
