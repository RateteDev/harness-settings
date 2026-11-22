# Googleサインイン

## 組み込み

Google Identity Servicesのボタンを`use_fedcm_for_button`でFedCMにして使う。
IDトークンは[公式の手順](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)で検証する。

## アカウントの振り分け

作成とログインの画面はどちらも同じボタンを使い`sub`の状態で進む先を決める。

| `sub`の状態 | 進む先 |
|---|---|
| 本登録のアカウントにある | どちらの画面から来てもログインさせる |
| 仮登録のアカウントにある | どちらの画面から来ても連絡先メールの確認から再開させる |
| どこにもなくログイン画面から来た | アカウントを作らず作成画面へ案内する |
| どこにもなく作成画面から来た | 仮登録のアカウントを作り連絡先メールの確認へ進める |

設定画面からの連携で別のアカウントに紐付いた`sub`が来たら断る。

## メールの確認

確認コードを省くのは公式の手順でGoogleがメールの所有を保証するとされる場合だけとする。

## Cross-Account Protection

[Cross-Account Protection](https://developers.google.com/identity/protocols/risc)の通知を受け公式文書のとおりに処理する。
