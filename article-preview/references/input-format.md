# article-preview入力記法

## CLI

```text
article-preview <input.mdx> [--out <output.html>] [--media <inline|link>]
article-preview fix-spacing <file.mdx> [...files]
article-preview validate <file.mdx> [...files]
```

- `--out`省略時はstdoutへ出す。
- `--media inline`は画像・動画をdata URIとして埋め込む。CLIの既定値も`inline`である。
- `--media link`はURLを残す。local pathが1つでもあれば、受け手から到達できないHTMLを作らないためerrorで停止する。
- `fix-spacing`はCJKと英数の間にある不要なspaceを除去し、変更したfileを上書きする。
- `validate`はrendererと共有する入力規則を検査する。

禁止事項に触れた入力は描画せず、非zeroで終了する。npmの`md-preview`は無関係なpackageなので使わない。

## 基本

標準GFMの太字、斜体、取り消し線、inline code、link、blockquote、水平線を使える。以下はrenderer固有の拡張である。

### titleと見出し

最初の`# title`はheroのh1となり、本文から除かれる。sectionは`##`で切る。目次が拾うのはh2だけで、h3は本文の小見出しとなる。h2以降にはidが付き、h2にはlink copy buttonが付く。

### frontmatter

frontmatterは任意である。あればheroへ対応する値を表示し、なければheroを省いてtitleと本文だけを描画する。書けるkeyは次に限る。すべて任意である。

| key | 形式 |
|---|---|
| `category` | 文字列 |
| `description` | 文字列 |
| `author` | 文字列 |
| `published` | ISO 8601の文字列。日時とoffsetを含め、引用符で囲む |
| `updated` | ISO 8601の文字列。日時とoffsetを含め、引用符で囲む |
| `tags` | 文字列の配列 |
| `image` | site内絶対pathの文字列 |
| `status` | `draft`、`published`、`archived`、`deleted`のいずれか |
| `reviewed` | ISO 8601の文字列。日時とoffsetを含め、引用符で囲む |

未知のkeyはwarningを出して無視し、既知keyの不正な値はerrorとする。titleは本文の最初のh1、slugはfile名、読了時間は本文から導出するためfrontmatterへ複製しない。

### Callout

```mdx
<Callout type="note|warning|caution" label="任意のlabel">本文</Callout>
```

`label`は省略できる。3語以外の`type`は`note`のiconと既定labelへfallbackする。

### CodeGroup

複数のcode blockをtab切り替えで表示する。

````mdx
<CodeGroup labels={["npm", "bun"]}>

```bash
npm install
```

```bash
bun install
```

</CodeGroup>
````

`labels`は文字列配列literalとして必須であり、直下のcode block数と一致させる。直下にはfenced code blockだけを置く。

### Mermaid

` ```mermaid `のfenceを使う。fence内frontmatterの`title`でheader labelを付けられ、省略時は`MERMAID`となる。描画できない図はdiagnosticとして報告される。

### code block

言語label、copy button、word-wrap toggleが付く。15行以上は自動で畳まれる。対応言語はjavascript、typescript、json、bash、sh、css、html、markdown、mdx、python、rust、go、yaml、toml、textであり、未対応のlabelはtextとして扱う。

### 画像と動画

```mdx
<Image src="https://example.com/a.png" alt="図の説明" ratio="16/9" caption="図: caption" />

<Video src="https://example.com/a.mp4" ratio="16/9" loop caption="動画: caption" />
```

- `<Image>`の属性は`src`、`alt`、`ratio`、`caption`。
- `<Video>`の属性は`src`、`ratio`、`caption`、`loop`。
- `src`は絶対URLまたはlocal pathを使える。ただし`--media link`は絶対URLだけを許す。
- `ratio`は`<width>/<height>`。省略時は`1/1`となる。
- `loop`は値を書かず`loop`だけを書く。動画は自動再生しない。
- `![alt](url)`も画像として扱う。

### URL cardとtweet card

bare URLを段落内に単独で置くとrich cardになる。`[text](url)`は通常linkのままになる。OGPを取得できないURLも通常linkへfallbackする。

XまたはTwitterのstatus URLを段落内に単独で置くとtweet cardになり、media、引用、reply元も表示する。

### table

GFM tableは列が多い場合に横scrollできる。
