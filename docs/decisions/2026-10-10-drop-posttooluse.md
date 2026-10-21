---
title: PostToolUse にフックを登録しない
description: PostToolUse の標準出力はエージェントに届かず、注入の合図だけを消費するため、スキーマの変更の注入は次のプロンプトに任せる
---

# PostToolUse にフックを登録しない

## Context (背景・課題)
- 文書やスキーマを書いた直後に `sync-triggers` を走らせ、スキーマの変更を注入する設計だった。
- Claude Code では、標準出力が文脈に入るのは `UserPromptSubmit` と `SessionStart` などに限られる。`PostToolUse` の標準出力は、デバッグログに出るだけで、エージェントには届かない。
- `sync-triggers` は出力した後にハッシュを更新する。そのため、`PostToolUse` で「出力した」ことになり、次のプロンプトでは「変更なし」と判断され、注入が消えていた。

## Decision (決定内容)
- `PostToolUse`（Antigravity の同等の登録を含む）へのフックの登録を外す。
- スキーマの変更は、次の `UserPromptSubmit`（Antigravity は `PreInvocation`）で、ハッシュの差として検知され、注入される。

## Consequences (影響・トレードオフ)
- スキーマを編集したターンの中では、エージェントは新しい内容を注入されない（編集した本人は内容を知っている）。次のプロンプトから反映される。
- 書き込みのたびのNodeの起動（約25ms）が無くなる。
- 注入の合図の消費が、届くイベントに限られる。
