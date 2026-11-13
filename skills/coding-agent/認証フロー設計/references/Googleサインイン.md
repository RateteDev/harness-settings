# Googleサインイン

Googleサインインを実装・レビューするときに読む。
連絡先メールの確認と重複の扱いは`連絡先メール.md`に従う。

## 組み込み

- Google Identity Services（GIS）のボタンを使い、新規の実装では`use_fedcm_for_button`でFedCMを有効にする。
- ボタンはGISが描画するものを使い、使えない場合だけブランドガイドラインに沿って自作する。
- 自作のボタンは標準色の「G」ロゴの色と縦横比を変えず、文言は「Googleで続ける」などGoogleの推奨文の訳にする。
- スコープは`openid email profile`とし、GoogleのAPIは呼ばないためアクセストークンや更新トークンを保存しない。
- CSPにはGISが求める`script-src`・`frame-src`・`connect-src`・`style-src`を加え、欠けるとボタンが表示されない。
- 別オリジンのiframeからGISを呼ぶ場合は親のiframeに`allow="identity-credentials-get"`を付ける。

## IDトークンの検証

GISはIDトークンを`login_uri`へPOSTの`credential`として送る。
サーバーは次をすべて確かめ、1つでも欠ければ拒否する。

- Cookieとリクエスト本文の`g_csrf_token`が両方あり完全に一致する。
- 署名がGoogleの公開鍵（`https://www.googleapis.com/oauth2/v3/certs`）で検証でき、鍵は`Cache-Control`に従ってキャッシュする。
- `aud`が自サービスのクライアントIDのいずれかと一致する。
- `iss`が`https://accounts.google.com`または`accounts.google.com`である。
- `exp`が過ぎていない。

Cloudflare WorkersではNode専用の`google-auth-library`が使えないため、Web Cryptoで動く`jose`の`createRemoteJWKSet`と`jwtVerify`で検証する。

## アカウントの特定

- アカウントは`sub`だけで特定し、`email`は識別子に使わない。
- Googleは`sub`を全アカウントで一意かつ再利用しないと定め、`email`は変わりうるとしている。
- `sub`は大文字小文字を区別する最大255文字のASCIIとして保存する。
- 1つの`sub`は1つのアカウントにだけ紐付け、別のアカウントに紐付いた`sub`の連携は拒否する。

## アカウント作成の流れ

1. 認証前の画面で利用規約への同意を取り、Googleのボタンを押させる。
2. IDトークンを検証し、`sub`に紐付くアカウントがなければ仮登録のアカウントを作る。
3. 表示名とアイコンはIDトークンの`name`と`picture`を初期値にする。
4. 連絡先メールはIDトークンの`email`を初期値として確認画面に出す。
5. 連絡先メールの確認が済んだら本登録にし、パスキーの追加を促す。

サインイン画面で`sub`に紐付くアカウントがない場合は自動で作らず、アカウントがないことを示して作成の画面へ誘導する。
利用規約への同意を経ずにアカウントを作らないためである。

## Googleのメールを確認済みとみなす条件

Googleがそのメールの管理者である場合だけ、確認コードを送らずに確認済みとする。

- `email`が`@gmail.com`で終わる。
- `email_verified`が真で`hd`がある（Google Workspaceのアカウント）。

`@gmail.com`以外で`hd`がない場合は、`email_verified`が真でも確認コードを送る。
Googleはアカウント作成時に一度確認しただけで、その後にメールの持ち主が変わりうると明記している。

## 連携

設定画面からの連携は、再認証の後にGoogleの認証を行い、得た`sub`をそのアカウントに紐付ける。

## Cross-Account Protection

公開するサービスではCross-Account Protection（RISC）でGoogleアカウント側の異変を受け取る。

- `sessions-revoked`、`tokens-revoked`、理由が`hijacking`の`account-disabled`を受けたら、そのアカウントの全セッションを無効にする。
- 理由のない`account-disabled`を受けたら、そのアカウントのGoogleサインインを止める。
- 受信したトークンは`https://accounts.google.com/.well-known/risc-configuration`の`issuer`と`jwks_uri`で検証し、`exp`は確かめない。
- 重複は`jti`で除き、成功時は202を返す。
- 導入にはGCPのサービスアカウントへ`roles/riscconfigs.admin`を付け、RISC APIの有効化と規約への同意が要る。
- Google Workspaceの利用者のイベントは届かない。

## 保存する値

| 値 | 用途 |
|---|---|
| `sub` | アカウントの特定（一意制約） |
| アカウントID | 紐付け先 |
| 連携日時・最終利用日時 | 設定画面での表示 |

## 参照

- [IDトークンの検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [FedCMへの移行](https://developers.google.com/identity/gsi/web/guides/fedcm-migration)
- [ブランドガイドライン](https://developers.google.com/identity/branding-guidelines)
- [Cross-Account Protection](https://developers.google.com/identity/protocols/risc)
