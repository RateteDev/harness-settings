# 秘匿値の渡し方

ホストは秘密情報の正本となるファイルを1本決め、アクセス権を`600`に制限する。shellは起動ファイルからsourceし、systemdユーザーユニットは必要なものだけが`EnvironmentFile=`で同じファイルを読む。

`EnvironmentFile=`の宣言は、そのユニットが秘密情報を使うという表明でもある。マネージャの環境へ秘密情報を取り込む`environment.d`は使わず、宣言していないユニットへ値を渡さない。

`EnvironmentFile=-{path}`のように任意指定にしてはならない。正本が無い場合はユニットを起動せず、設定漏れをその場で露出させる。

## 共有ファイルの書式

同じファイルをshellとsystemdが別々に解釈するため、両方で同じ値になる書式だけを使う。

| 書き方 | 規則 |
|---|---|
| `KEY='value'` | 既定。single quote以外をそのまま保持する |
| `KEY="value"` | 値にsingle quoteを含む場合に使い、backslash、double quote、backtick、dollar signをbackslashでescapeする |
| `KEY=value` | shellのメタ文字を含まない単純な値に限る |
| `export KEY=value` | 使わない。`EnvironmentFile=`の代入として解釈されない |

`Environment=`に秘匿値を直接書いてはならない。ユニット定義の表示から値を読めるため、正本を経由する意図が失われる。
