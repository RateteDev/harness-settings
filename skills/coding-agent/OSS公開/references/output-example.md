# 成果物の見本

READMEとリリースノートの仕上がりは、次の公開リポジトリを手本にする。
URLはいずれも`main`上のパスで参照し、見本のリポジトリが作り直されても辿れるようにしている。

| 成果物 | 参照先 |
|---|---|
| README（既定言語） | https://github.com/RateteDev/chatgpt-auth-for-responses/blob/main/README.md |
| README（英語版） | https://github.com/RateteDev/chatgpt-auth-for-responses/blob/main/docs/readme/README.en.md |
| リリースノート | https://github.com/RateteDev/chatgpt-auth-for-responses/releases/tag/v0.1.0 |

## 写す観点

- 情報の並べ方と、見出し・表・区切り線などの見た目の形式を見本にそろえる。
- [README](readme.md)と[リリース](release.md)の規則のうち見た目に表れるものは、見本と並べて1つずつ点検する。

## 対象リポジトリに合わせる観点

見本の内容とプラットフォーム固有の要素は写さず、対象リポジトリの実態に合わせる。

- バッジの文言（見本はruntime Bunとlicense MIT）
- ワードマークの色と字体
- 節の数と名前
- コマンドとその出力

## 点検の手段

1. 対象のREADMEとリリースノートを、GitHubの`POST /markdown`（mode: gfm）でHTMLへ変換する。
2. HTMLをローカルのヘッドレスブラウザで画像に描き出し、見本と並べる。
3. 写す観点を1つずつ確かめ、見本に届かない観点を直す。
   写せない観点は理由を添えて残課題にする。
