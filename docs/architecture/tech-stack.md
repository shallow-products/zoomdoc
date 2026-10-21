---
title: 技術スタック・開発ツール選定仕様書
description: プラグインランタイム、開発環境、および開発AIエージェントが使うツールの選定定義
---

# 技術スタック・開発ツール選定仕様書

## 1. プラグインランタイム

| レイヤー | 採用技術 | 選定理由・特徴 |
| :--- | :--- | :--- |
| **実行基盤** | **Node.js (>=18)** | フックとバンドル済みのスクリプトは、素のNode.js（18以上）で動く。開発（ソースの実行・テスト）は 22 以上。 |
| **フック** | **ゼロ依存の Node.js スクリプト**（`scripts/hooks/*.js`） | 変化が無いときは走査も通知もせず、数ミリ秒で終わる。 |
| **移行・lint** | **単一バンドル**（`dist/migrate.js`, `dist/doc_lint.js`） | `node_modules` が無いプロジェクトでも実行できる。esbuild で同梱する。 |
| **索引・サーバー** | **持たない** | 正本はファイルシステムだけ。探索はスキルが示すコマンドで行う。 |

## 2. 開発環境 (Dev Tooling)

| 役割 | 採用技術 | コマンド |
| :--- | :--- | :--- |
| **実行・環境分離** | **Docker Compose** | ホスト環境を汚さない。サービス名・ボリューム名は `zoomdoc-*`。 |
| **テストランナー** | **Vitest** | `docker compose run --rm zoomdoc-dev npm test` |
| **Linter / Formatter** | **Biome** | `docker compose run --rm zoomdoc-dev npm run lint` |
| **型検査** | **tsc --noEmit** | `docker compose run --rm zoomdoc-dev npm run typecheck` |
| **バンドラー** | **esbuild** | `docker compose run --rm zoomdoc-dev npm run build` |
| **実エージェントの E2E** | **`zoomdoc-e2e` コンテナ** | Claude Code CLI を入れた別サービス。手順は `tests/walkthrough/README.md`。 |

## 3. 開発AIエージェントが使うツール

- **プラグイン**: `zoomdoc`（自前。スキル `zoomdoc:read` / `zoomdoc:write` / `zoomdoc:move` / `zoomdoc:schema` と、フック）。外部ライブラリの調査には、`context7`。
- **標準CLI**: `gh`（Issue・PR・CI）、`git`（ブランチ・ワークツリー）、`docker compose`（テスト・lint・ビルドの隔離実行）。
- **禁止**: ホストでの `node` / `npm` の直接実行。リポジトリ全体への無差別な `find .` や再帰 `grep`（探索はスキルが示す、範囲を絞ったコマンドで行う）。
