# Googleサインイン

## 組み込み

Google Identity Servicesのボタンを`use_fedcm_for_button`でFedCMにして使う。
スコープは`openid email profile`とし更新トークンは保存しない。
Cloudflare Workersでは`jose`の`createRemoteJWKSet`と`jwtVerify`でIDトークンを検証する。
`g_csrf_token`がCookieと本文の両方にあり一致することを確かめる。
`iss`は`https://accounts.google.com`と`accounts.google.com`の両方を受け入れる。

## アカウントの振り分け

アカウントは`sub`だけで特定し`email`では引かない。
作成とログインの画面はどちらも同じボタンを使い`sub`の状態で進む先を決める。

| `sub`の状態 | 進む先 |
|---|---|
| 本登録のアカウントにある | どちらの画面から来てもログインさせる |
| 仮登録のアカウントにある | どちらの画面から来ても連絡先メールの確認から再開させる |
| どこにもなくログイン画面から来た | アカウントを作らず作成画面へ案内する |
| どこにもなく作成画面から来た | 仮登録のアカウントを作り連絡先メールの確認へ進める |

設定画面からの連携で別のアカウントに紐付いた`sub`が来たら断る。

## メールを確認済みとする条件

`email`が`@gmail.com`で終わるか`email_verified`が真で`hd`があるときは確認コードを送らない。
それ以外は`email_verified`が真でもコードを送る。

## Cross-Account Protection

`sessions-revoked`と`tokens-revoked`と理由が`hijacking`の`account-disabled`を受けたら全セッションを切る。
理由のない`account-disabled`を受けたらそのアカウントのGoogleサインインを止める。
Google Workspaceの利用者の通知は届かない。

## 参照

[IDトークンの検証](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)と[Cross-Account Protection](https://developers.google.com/identity/protocols/risc)の公式文書に従う。
