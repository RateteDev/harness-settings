# Python ランタイムガード

`pip` / `pip3` / `pipx` の直接実行を抑止し uv へ誘導する。`python3` は引数パターンに応じてブロック / ヒント / パススルーで振り分ける。JS ランタイムガードと同じアーキテクチャ。

## 管理対象
| ファイル | 役割 |
|----------|------|
| `scripts/py-runtime-guard.sh` | 本体（呼び出し名と引数でディスパッチ） |
| `~/.local/bin/{pip,pip3,pipx,python3,real-pip,real-pip3,real-pipx,real-python3}` | 上記スクリプトへのシンボリックリンク 8 本 |

## 振り分けルール

| 呼び出し | 動作 | 代替案内 |
|---------|------|---------|
| `pip` / `pip3` | ブロック | `uv pip` / `uv add` |
| `pipx` | ブロック | `uvx` / `uv tool install` |
| `python3 -m pip` | ブロック | `uv pip` |
| `python3 -m venv` | ヒント＋実行 | `uv venv` |
| `python3 -m <other>` | ヒント＋実行 | `uv run -m <other>` |
| `python3 <file>.py` | ヒント＋実行 | `uv run <file>.py` |
| `python3 -c` / `python3`（REPL） | パススルー | — |

## 前提
- `~/.local/bin/` が PATH の前方にあり、本物より先にガードが解決されること
- uv を別途インストール済みであること

## JS ランタイムガードとの差異
- `python3` は全面ブロックできないため引数パターンで振り分ける
- ヒントは stderr に出力し、実行は本物に委譲する（パイプ非破壊）
