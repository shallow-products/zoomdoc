---
title: 開発環境セットアップ＆運用ガイド
description: Docker環境での依存インストール、ビルド、テスト実行手順とトラブルシューティング
---

# 開発環境セットアップ＆運用ガイド

`AGENT.md` に準拠した、Docker コンテナ内でのビルド・テスト・検証手順。

## 1. 前提条件

- Docker および Docker Compose がホスト環境で稼働していること。
- **ホストの Node.js / npm の直接実行は禁止（コンテナ内実行が絶対規律）。**

## 2. 開発ツールチェーン（モダンデファクト）

- **テストランナー**: `Vitest`（超高速・TypeScriptネイティブ実行）
- **Linter / Formatter**: `Biome`（Rust製統合型リンター＆フォーマッター）
- **型検査**: `tsc --noEmit`
- **バンドラー**: `esbuild`（Node.js 18以上向けの単一バンドル生成）

## 3. 基本コマンド一覧

```bash
# 依存パッケージのインストール
docker compose run --rm zoomdoc-dev npm install

# 単体・結合テスト実行 (Vitest)
docker compose run --rm zoomdoc-dev npm test

# リント検証 (Biome)
docker compose run --rm zoomdoc-dev npm run lint

# フォーマット＆リント自動修正 (Biome)
docker compose run --rm zoomdoc-dev npm run lint:fix

# TypeScript 型チェック
docker compose run --rm zoomdoc-dev npm run typecheck

# 本番バンドルビルド (esbuild -> dist/doc_lint.js, dist/migrate.js)
docker compose run --rm zoomdoc-dev npm run build
```

