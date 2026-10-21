---
title: フックの通知・実行コストの抑制
description: 毎プロンプト走るフックが、変化が無い時に走査も通知もしない仕組みと、無効化の設定
---

# フックの通知・実行コストの抑制

`hooks/hooks.json`（Claude Code）は `SessionStart` / `UserPromptSubmit` で、入口の `run.js` を走らせる。`run.js` は、1つのプロセスで `detect-issues` と `sync-triggers` を順に実行する（Nodeの起動を1回で済ませる）。`PostToolUse` には登録しない（理由は [2026-10-10-drop-posttooluse.md](../decisions/2026-10-10-drop-posttooluse.md)）。どちらも検知と通知だけで、文書は書き換えない。無関係なプロンプトで通知もコストも増やさないことが目的。

## 動作

- **セッション開始時だけ必ず出す**: `SessionStart` は `--force` を渡す。スキーマの内容（`sync-triggers`）、未解決の指摘（`detect-issues`）はここで1回出る。
- **それ以外は変化した時だけ出す**:
  - `sync-triggers` は `schema.yaml` のハッシュが前回と違う時だけ。
  - `detect-issues` は、対象ファイルの署名（件数・最大mtime・合計サイズ）が前回と同じなら、走査も通知もしない。署名が変わっても指摘の内容（対象と種類。日付は含めない）が前回と同じなら通知しない。
- **直っていない指摘は、一定間隔で再通知する**: 無反応のままプロンプトが10回続いたら、同じ指摘をもう一度出す（流れてしまった通知を忘れないため）。指摘が無ければ何も出さない。間隔は `.zoomdoc/config.json` の `hooks.renotifyEvery`（プロンプト数。`0` で再通知しない）。`SessionStart` の通知で数え直す。
- 前回の署名と指摘は `.zoomdoc/.cache/hook-state.json` に持つ。消しても通知が1回増えるだけで、動作は変わらない。
- 署名は `stat` だけで求めるので、実行時間は文書の件数にほぼ依存しない。下限はNode起動1回分。

## 目標値

変更が無い時の `UserPromptSubmit` の追加遅延は、文書2000件でも合計 150ms 以内（実測は約100ms、全体の大半がNode起動）。

## 無効化

フック単位で止められる。名前は `detect-issues` / `sync-triggers`。

- `.zoomdoc/config.json` に `{ "hooks": { "detect-issues": false } }`
- 環境変数 `ZOOMDOC_DISABLE_HOOKS=detect-issues,sync-triggers`（`all` で全て）

## 注意

どのフックも `Stop` には登録しない（終了を止める仕組みは、直せない指摘でループするため）。`zoomdoc:lint` はユーザーが自分で呼ぶ調査の道具で自発的には走らないため、自動で働くのはフックだけ。フックは軽く決定論的な検知に絞って通知し、再通知で見落としを防ぐ。Antigravity の `hooks.json` は `--force` を渡さないので、セッション開始時の通知は無く、再通知の間隔だけで見直される。
