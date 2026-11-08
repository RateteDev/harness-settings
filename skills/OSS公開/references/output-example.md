# 成果物のスタイル見本

READMEおよびリリースノートの構成や見た目は、以下の公開リポジトリを基準とします。

| 成果物 | 参照URL（mainブランチ） |
|---|---|
| README（既定言語） | https://github.com/RateteDev/chatgpt-auth-for-responses/blob/main/README.md |
| README（英語版） | https://github.com/RateteDev/chatgpt-auth-for-responses/blob/main/docs/readme/README.en.md |
| リリースノート | https://github.com/RateteDev/chatgpt-auth-for-responses/releases/tag/v0.1.0 |

## スタイル適用の基準

### 準拠する要素（見本に合わせる）
- 情報の並び順とレイアウト
- 見出し、表、区切り線などの視覚的な体裁
- [README](readme.md) および [リリース](release.md) のガイドラインに沿った外観

### 準拠しない要素（対象リポジトリの実態に合わせる）
見本の内容をそのままコピーせず、対象プロジェクト固有の情報に置き換えてください。
- バッジの記述（ランタイム、ライセンスなど）
- ワードマークの色やフォント
- セクションの数と見出し名
- 記載するコマンドとその実行結果

## レビュー手順

1. **HTML化**: 対象のMarkdownをGitHub API（`POST /markdown` / mode: gfm）でHTMLに変換する。
2. **描画比較**: ヘッドレスブラウザ等でHTMLを画像化し、見本と並べて外観を比較する。
3. **修正・記録**:
   - 見本と乖離している箇所を修正する。
   - 制約等により再現できない箇所は、理由を明記して残課題として記録する。
