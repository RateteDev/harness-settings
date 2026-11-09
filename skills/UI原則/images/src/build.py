"""UI原則の各項目に添えるBAD/GOODの比較画像の元になるHTMLを書き出す。

使い方：
  python3 build.py <HTMLの出力先>
  node render.js <HTMLの出力先> ..   # images/ にPNGを書き出す

画像には説明文を入れず、BAD/GOODのラベルと文字を使わない印だけで違いを示す。
理由はSKILL.mdの本文に書き、画像と本文で同じことを二重に持たないためである。
BADとGOODの違いはその項目の1点だけにし、見本の文はほかの項目にも反しないようにする。
見た目は特定のデザインスタイルに寄せず、中立にする。
"""

import pathlib
import sys

BASE_CSS = """
*{box-sizing:border-box;margin:0}
body{width:1200px;padding:32px;background:#f3f3f1;font-family:"Noto Sans JP",sans-serif;color:#1a1a1a;word-break:auto-phrase}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.panel{position:relative;background:#fff;border-radius:12px;padding:24px 28px 32px;border:2px solid #ddd}
.bad{border-color:#e8b4b4}.good{border-color:#b5d9bf}
.tag{display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:15px;letter-spacing:.06em;padding:4px 12px 4px 10px;border-radius:999px;color:#fff;margin-bottom:20px}
.bad .tag{background:#d23b3b}.good .tag{background:#2f8f4e}
h2{font-size:26px;font-weight:700;line-height:1.4}
p{font-size:15px;line-height:1.85}
h2+p,.lead+p{margin-top:16px}
h2:has(.mark)+p{margin-top:20px}
.lead{margin-top:14px;font-size:16px;color:#555;line-height:1.6}
.s{display:block}
.mark{outline:3px dashed #d23b3b;outline-offset:4px;border-radius:2px}
"""

GUIDE_SCRIPT = """<script>
// 揃っているか・ずれているかを、指定した要素の端に引いた横線で示す。
document.fonts.ready.then(()=>{document.querySelectorAll('[data-guides]').forEach(c=>{
  const box=c.getBoundingClientRect(); const ys=new Set();
  c.dataset.guides.split(',').forEach(rule=>{const [sel,edge]=rule.split(':');
    c.querySelectorAll(sel).forEach(k=>{const r=k.getBoundingClientRect(); ys.add(Math.round(r[edge]-box.top));});});
  ys.forEach(y=>{const g=document.createElement('div'); g.className='guide'; g.style.top=(y-1)+'px'; c.appendChild(g);});
});});
</script>"""


def page(bad, good, css="", script=""):
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>{BASE_CSS}{css}</style></head><body>
<div class="grid">
  <div class="panel bad"><span class="tag">✕ BAD</span>{bad}</div>
  <div class="panel good"><span class="tag">✓ GOOD</span>{good}</div>
</div>{script}</body></html>"""


def lines(*sentences):
    return "".join(f'<span class="s">{x}</span>' for x in sentences)


PAGES = {}

# 1. 見出しの直後に、情報を足さない補足を置かない
notify = "<p>" + lines("届け先は、設定画面の通知の欄から選べます。", "両方を選ぶと、同じ内容が両方に届きます。") + "</p>"
PAGES["01-heading-lead"] = page(
    '<h2>通知はメールとSlackに届く</h2><p class="lead mark">通知の届け先について説明します。</p>' + notify,
    "<h2>通知はメールとSlackに届く</h2>" + notify,
)

# 2. 要点を言い換えた締めのひとことを書かない
build = "<p>" + lines("依存パッケージの取得結果をキャッシュします。", "2回目以降のビルドでは、取得を省きます。") + "</p>"
PAGES["02-closing-line"] = page(
    "<h2>ビルドは2回目から速くなる</h2>" + build + '<p class="closer mark">待ち時間が減れば、開発はもっと軽くなる。</p>',
    "<h2>ビルドは2回目から速くなる</h2>" + build,
    css=".closer{margin-top:16px;font-weight:700}",
)

# 3. 横に並ぶ要素の端と、中の要素の高さを揃える
cards = (
    '<div class="cards" data-guides=".card:bottom,.fav:top">'
    '<div class="card"><b>weather</b><p>現在の天気を返す。</p><span class="fav">☆ お気に入り</span></div>'
    '<div class="card"><b>github</b><p>Issueを読み書きする。</p><p>コメントも操作できる。</p><span class="fav">☆ お気に入り</span></div>'
    "</div>"
)
PAGES["03-align"] = page(
    cards,
    cards,
    css=""".cards{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px}
.card{border:2px solid #1a1a1a;border-radius:10px;padding:16px 18px;display:flex;flex-direction:column}
.card b{font-size:19px;margin-bottom:6px}.card p{font-size:14px;line-height:1.7}
.fav{align-self:flex-start;margin-top:14px;border:2px solid #1a1a1a;border-radius:999px;padding:3px 14px;font-size:13px;font-weight:700}
.bad .cards{align-items:start}
.good .cards{align-items:stretch}.good .fav{margin-top:auto}.good .card p:last-of-type{margin-bottom:14px}
.guide{position:absolute;left:-12px;right:-12px;height:0;border-top:2px dashed}
.bad .guide{border-color:#d23b3b}.good .guide{border-color:#2f8f4e}""",
    script=GUIDE_SCRIPT,
)

# 4. 不自然な位置で折り返さない（BADの折り返しを再現できるよう、行は手で区切る）
PAGES["04-line-break"] = page(
    '<div class="col"><p>' + lines('保存できる容量は、残り<span class="mark">1</span>', '<span class="mark">2</span>GBです。') + "</p>"
    "<p>" + lines("古いバックアップは、30日たつと自動で削除され", '<span class="mark">る。</span>') + "</p></div>",
    '<div class="col"><p>' + lines("保存できる容量は、", "残り12GBです。") + "</p>"
    "<p>" + lines("古いバックアップは、30日たつと", "自動で削除される。") + "</p></div>",
    css=".col{white-space:nowrap}.col p{font-size:20px;line-height:1.7}.col p+p{margin-top:20px}.col .mark{outline-offset:2px}",
)

# 5. 本文の段落では、1文ごとに改行する
PAGES["05-sentence-per-line"] = page(
    "<h2>パスワードは12文字以上</h2>"
    '<p class="para">英字と数字を、それぞれ1文字以上含めてください。<span class="mark">記</span>号も使えます。'
    '<span class="mark">前</span>と同じパスワードは使えません。</p>',
    "<h2>パスワードは12文字以上</h2>"
    '<p class="para">' + lines("英字と数字を、それぞれ1文字以上含めてください。", "記号も使えます。", "前と同じパスワードは使えません。") + "</p>",
    css=".para{max-width:420px}.para .mark{outline-offset:1px}",
)

# 6. 見出しは事実を言い切る
export = "<p>" + lines("書き出す月を選ぶと、その月の明細が1つのファイルになります。", "文字コードはUTF-8です。") + "</p>"
PAGES["06-heading-statement"] = page(
    '<h2><span class="mark">データのエクスポートについて</span></h2>' + export,
    "<h2>CSVは月ごとに書き出せる</h2>" + export,
)

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, html in PAGES.items():
        (out / f"{name}.html").write_text(html, encoding="utf-8")
