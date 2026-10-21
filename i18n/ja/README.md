# zoomdoc

[English](../../README.md)

**プロジェクトの文書を、AIコーディングエージェントが見つけやすく、新しく、一貫した状態に保つ。**

zoomdoc は、[Claude Code](https://claude.com/claude-code) と Google Antigravity のプラグインです。どの種類の文書をどこに置き、いつ書き、いつ更新するかを、小さな `schema.yaml` 1つに書きます。フックが、セッションの開始のたびにそのスキーマをエージェントへ渡し、ずれが生じたら知らせます。スキルは、文書を読む・書く・動かす手順を、最初から最後まで与えます。

サーバーも、索引も、データベースもありません。正本は、ディスク上のファイルだけです。

## 特長

- **読む量を減らして、よりよく答える。** エージェントは、スキーマと `title`・`description` の一覧から始め、必要な文書だけを開きます。ツリー全体への `grep` や `find` は不要です。
- **文書が腐らない。** 文書の行ごとに、いつ作り、いつ更新し、いつ消してよいかを書きます。重複した title、リンク切れ、Frontmatter の欠落を検知して知らせます。
- **作業の邪魔をしない。** フックは通知するだけで、作業を止めることも、文書を書き換えることもしません。変化が無いときは、トークンを使いません（実行時間は、文書10〜1,000件で30〜50ミリ秒程度。[ベンチマーク](../../docs/evaluation/benchmark.md)を参照）。
- **自然文で書ける。** 機械が検査するのは、フォルダのパスだけです。名前の規則・雛形・更新の条件は、エージェントが読んで従う文章で書きます。
- **依存なし。** フックとスクリプトは、`npm install` なしで、Node.js 18 以上で動きます。

## 仕組み

| 部品 | 実体 | 役割 |
| :--- | :--- | :--- |
| **スキーマ** | `.zoomdoc/schema.yaml`、`.zoomdoc/templates/` | フォルダと、そのフォルダに置く文書（名前・説明・雛形・作るとき・更新するとき・削除するとき）を宣言する。 |
| **フック** | `SessionStart`、`UserPromptSubmit` | セッションの開始時とスキーマの変更時に、スキーマをそのまま注入する。リンク切れ・Frontmatter の欠落・管理外のフォルダ・重複した title を知らせる。スキーマが無いリポジトリでは、何もしない。 |
| **スキル** | `zoomdoc:read` `zoomdoc:write` `zoomdoc:move` `zoomdoc:schema` | 作業ごとに、完結した手順を持つ。出典つきで答える、決定を正しい場所に記録する、リンクを保って移動・削除する、スキーマを変える。 |

## インストール

Node.js 18 以上が必要です。

```bash
claude plugin marketplace add shallow-products/zoomdoc
claude plugin install zoomdoc@zoomdoc
```

スコープが「ローカル」のプラグインは、そのプロジェクトでだけ有効です。すべてのプロジェクトで使うときは、「ユーザー」スコープで入れてください。Antigravity は、ルートの `plugin.json` と `hooks.json` を使います。

## クイックスタート

管理したいリポジトリで、次を実行します。

```text
/zoomdoc:init
```

`init` は、独立した3つの段階で進み、何度実行しても安全です。

1. **配備**: `.zoomdoc/schema.yaml` とテンプレートを置きます。既存のファイルは上書きしません。
2. **診断**: 既存の文書を調べ、問題の種類ごとの件数を示します。
3. **整合**: 問題があれば、選びます。文書をスキーマに合わせて移す（確認を経る、元に戻せる移行）、スキーマを文書に合わせて変える、何もしない。

その後は、ふだんどおりに作業するだけです。エージェントは、セッションの開始時にスキーマを受け取り、`zoomdoc:read` で文書から質問に答え、`zoomdoc:write` で決定や仕様を記録します。`/zoomdoc:lint` は、必要なときに全体の静的チェックを行います。

## 20行のスキーマ

```yaml
folders:
  docs/decisions:
    description: なぜそう決めたか。アーキテクチャ決定記録を、1決定1ファイルで置く。
    documents:
      - name: YYYY-MM-DD-<slug>.md
        description: 1つの決定と、その理由・代替案。
        template: .zoomdoc/templates/adr.md
        create: ライブラリ・DB・主要な設計方針を選んだとき。
        update: 更新しない。決定が変わったときは、新しい決定を書く。
  docs/architecture:
    description: 今どういう構造になっているか。
    documents:
      - name: overview.md
        description: システム全体像・層構造・コンポーネント連携。
        create: 全体像を初めて整理したとき。
        update: 構造やコンポーネントの連携が変わったとき。
```

文書の行は、`name`・`description`・`create`・`update` が必須で、`template` と `remove` は任意です。値はすべて自然文です。設計の全体は、[スキーマのガバナンス](../../docs/architecture/schema-governance.md)を参照してください。

## スキル

| 呼び出し | 目的 |
| :--- | :--- |
| `/zoomdoc:init` | zoomdoc の導入: プロジェクトの調査、構成の選択、スキーマの承認、配備 |
| `/zoomdoc:lint` | 静的チェックのあと、エージェントが矛盾・重複を調べて直す |
| `zoomdoc:read` · `write` · `move` · `schema` | エージェントが自動で選ぶ手順 |

## 変えるもの・変えないもの

- `.zoomdoc/schema.yaml` が無ければ、フックは何もしません。
- フックと `/zoomdoc:lint` は、文書を書き換えません。検知して知らせるだけで、直すのは、あなたの監督下のエージェントです。
- 自動の書き込みは、承認された移行だけです。先に dry-run を確認し、すべての移動を `.zoomdoc/migration-log.json` に記録し、`rollback` で元の配置に戻せます。移行のパスは、プロジェクトのルートの内側に限られます。

## 設定

- **フックの無効化**: `ZOOMDOC_DISABLE_HOOKS=all`（または `detect-issues`、`sync-triggers`。カンマ区切り）を設定するか、`.zoomdoc/config.json` に `{"hooks": {"detect-issues": false}}` と書きます。
- **再通知**: 直っていない問題は、反応のないプロンプトが10回続くと、もう一度知らせます。`{"hooks": {"renotifyEvery": 20}}` で変えられます（`0` で再通知しない）。
- **スキーマは絞る。** スキーマは、毎セッション、エージェントの文脈に入ります。長いほどトークンを使い、細部を読み落としやすくなります。長い説明は、雛形に移してください。

## さらに詳しく

- [概要](../../docs/architecture/overview.md)・[技術スタック](../../docs/architecture/tech-stack.md)
- [PostToolUse を使わない理由](../../docs/decisions/2026-10-10-drop-posttooluse.md)・[MCP サーバーを持たない理由](../../docs/decisions/2026-10-09-schema-direct-no-mcp.md)
- [評価とベンチマーク](../../docs/evaluation/benchmark.md)
- [変更履歴](../../CHANGELOG.md)

## コントリビュート

Issue と PR を歓迎します。[CONTRIBUTING.md](../../CONTRIBUTING.md) を参照してください。脆弱性は、[SECURITY.md](../../SECURITY.md) のとおり、非公開で報告してください。このプロジェクトは、[行動規範](../../CODE_OF_CONDUCT.md)に従います。

## ライセンス

[MIT](../../LICENSE)
