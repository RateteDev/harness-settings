# Googleサインイン

## 組み込み

- Google Identity Servicesのボタンを`use_fedcm_for_button`でFedCMにして使う。
- スコープは`openid email profile`とし更新トークンは保存しない。
- Cloudflare Workersでは`jose`の`createRemoteJWKSet`と`jwtVerify`でIDトークンを検証する。
- `g_csrf_token`がCookieと本文の両方にあり一致することを確かめる。
- `iss`は`https://accounts.google.com`と`accounts.google.com`の両方を受け入れる。

## アカウント

- `sub`だけで特定し`email`では引かない。
- 別のアカウントに紐付いた`sub`の連携は断る。
- サインイン画面に未知の`sub`が来たらアカウントを作らず作成画面へ案内する。

## メールを確認済みとする条件

次のどちらかなら確認コードを送らない。

- `email`が`@gmail.com`で終わる。
- `email_verified`が真で`hd`がある。

それ以外は`email_verified`が真でもコードを送る。

## Cross-Account Protection

- `sessions-revoked`と`tokens-revoked`と理由が`hijacking`の`account-disabled`を受けたら全セッションを切る。
- 理由のない`account-disabled`を受けたらそのアカウントのGoogleサインインを止める。
- Google Workspaceの利用者の通知は届かない。

## 参照

- [IDトークンの検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Cross-Account Protection](https://developers.google.com/identity/protocols/risc)
