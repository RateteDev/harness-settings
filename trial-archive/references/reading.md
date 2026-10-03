# アーカイブHTMLを読む

ファイル名に「アーカイブ」を含むHTMLは、`id="archive-guide"` のdata block（`<script type="text/markdown">`）にある**説明書を先に読む**。説明書は作成者が読者向けに、読む順と重要な箇所をid（`#section-02` など）で示している。本文は説明書の案内に従い、必要な箇所だけを読む。

抽出:

```sh
python3 - "$FILE" <<'PY'
import re, sys
html = open(sys.argv[1], encoding="utf-8").read()
m = re.search(r'<script[^>]*id="archive-guide"[^>]*>(.*?)</script>', html, re.S)
if m is None:
    sys.exit("no archive-guide")
print(m.group(1))
PY
```

- `#section-NN` は描画後の節の箱を指す。その箱を取り出せば、節の本文まで過不足なく取れる。
- 記録は生のMarkdownのコードブロック、図は `<img>` のdata URI、素材は畳んだサブセクションにある。説明書に従えば全文を読まなくてよい。
- `archive-guide` が無ければ通常のHTMLとして扱う。
