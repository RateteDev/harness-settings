#!/bin/bash
# クラウド環境の設定画面にある「セットアップスクリプト」欄の内容。
# 欄は「ファイルを選択」でこのファイルを読み込めるため、実行権限は付けない。
# このファイルを変えたら、画面の欄にも貼り直す。全体の流れは apply.sh の冒頭の図を参照。
set -euo pipefail
REPO_DIR=/opt/harness-settings

# 作り直した環境にクローンが残っていても、実行先が古いままにならないよう最新に揃える。
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch --depth 1 origin HEAD
  git -C "$REPO_DIR" reset --hard FETCH_HEAD
else
  git clone --depth 1 https://github.com/RateteDev/harness-settings "$REPO_DIR"
fi
exec "$REPO_DIR/anthropic/claude-code-cloud-setup/apply.sh"
