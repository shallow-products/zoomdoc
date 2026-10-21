import fs from 'node:fs';
import path from 'node:path';

const targetDir = path.resolve(process.cwd(), 'tests/fixtures/sample-legacy-project/docs');

const files = [
  // 1. Guides / Manuals
  {
    path: 'setup.md',
    content: `# ローカル環境セットアップ手順
Node.js 22 と Docker のセットアップ手順です。
リポジトリをクローンした後、docker compose up を実行して環境を起動します。
環境変数は .env.example をコピーして .env を作成してください。`
  },
  {
    path: 'quickstart.md',
    content: `# クイックスタートガイド
開発者が最初の5分でAPIを実行するための手順です。
curl http://localhost:3000/health を実行して疎通確認を行います。`
  },
  {
    path: 'troubleshooting.md',
    content: `# トラブルシューティング
ポート3000が競合する場合の対処法や、DB接続エラー時のキャッシュクリア手順を記載しています。`
  },
  {
    path: 'faq.md',
    content: `# よくある質問 (FAQ)
社内ツールや認証トークンの発行方法についてのよくある問い合わせと回答集です。`
  },
  {
    path: 'tips.md',
    content: `# 開発Tips集
VSCodeの推奨拡張機能や、デバッグ実行時のショートカット集。`
  },

  // 2. Architecture / Specifications
  {
    path: 'architecture.md',
    content: `# 全体システム構成図とアーキテクチャ
Next.js フロントエンド、NestJS バックエンド、PostgreSQL データベースからなる構成。
各マイクロサービス間の通信プロトコルとデータフローの概要。`
  },
  {
    path: 'db-schema.md',
    content: `# データベース物理設計
Prisma を用いたスキーマ定義、users, organizations, billing テーブルのリレーションとインデックス設計。`
  },
  {
    path: 'api-specs.md',
    content: `# REST API 仕様概要
認証ヘッダー仕様（Bearer JWT）および主要エンドポイント（/api/v1/auth, /api/v1/users）のエラーコード仕様。`
  },
  {
    path: 'security.md',
    content: `# セキュリティガイドラインとポリシー
CORS設定、CSPヘッダーの適用、パスワードハッシュ（Argon2id）の暗号化方式要件。`
  },
  {
    path: 'events.md',
    content: `# ドメインイベント設計
RabbitMQ を介した非同期イベントキューのメッセージフォーマットとリトライポリシー。`
  },
  {
    path: 'auth-flow.md',
    content: `# 認証・認可フロー仕様書
OpenID Connect (OIDC) プロバイダ連携とリフレッシュトークンローテーションの処理シーケンス。`
  },

  // 3. Historical notes / Garbage / Deprecated (Should be archived)
  {
    path: 'memo_2023_04.md',
    content: `# 2023年4月 開発キックオフメモ
当時の初期メンバーの雑多なアイデアメモ。現在の実装とは全く異なる古いDB案が書かれている。`
  },
  {
    path: 'memo_auth_old.md',
    content: `# 【廃止】旧Cookie認証の検討メモ
v1リリース前に破棄されたCookieベース認証のメモ。参照禁止。`
  },
  {
    path: 'meeting_notes_2024.md',
    content: `# 2024年1月定例ミーティング議事録
Q1のロードマップ検討とメンバーのアサイン調整メモ。`
  },
  {
    path: 'temp_scratch.md',
    content: `# 一時作業用スクラッチ
curl のテストペイロードの貼り付けログ。後で消す。`
  },
  {
    path: 'draft_v1_deprecated.md',
    content: `# ドラフト版旧課金仕様（非推奨）
Stripe導入前の独自決済ゲートウェイ検討書。不採用となったため不要。`
  },
  {
    path: 'todo_ideas.md',
    content: `# アイデア出しブレスト用TODO
将来的にやりたい機能の走り書きリスト（検索機能、ダークモードなど）。`
  },

  // 4. Operations / Infrastructure
  {
    path: 'operations/deploy.md',
    content: `# 本番デプロイ手順書
GitHub Actions をトリガーとした AWS ECS への blue/green デプロイ手順と承認フロー。`
  },
  {
    path: 'operations/incident-response.md',
    content: `# 障害対応・オンコール手順
PagerDuty アラート検知時の初動対応、Slack 障害チャンネル作成、ロールバック判断基準。`
  },
  {
    path: 'operations/backup.md',
    content: `# データベースバックアップ＆リストア手順
AWS RDS の自動スナップショット取得設定と、災害復旧時の特定時点リカバリ(PITR)手順。`
  },
  {
    path: 'operations/monitoring.md',
    content: `# 監視・メトリクス設計
Datadog による APM 監視、レイテンシSLOおよびエラーレートのアラート閾値設定。`
  },

  // 5. Deep nested / Specific features
  {
    path: 'features/billing/stripe-integration.md',
    content: `# Stripe 決済連携仕様
Webhook（customer.subscription.updated）の署名検証とプラン更新処理の実装詳細。`
  },
  {
    path: 'features/billing/invoices.md',
    content: `# 請求書PDF生成機能
PDFKit を用いた適格請求書（インボイス制度対応）フォーマット生成ロジック。`
  },
  {
    path: 'features/notifications/email.md',
    content: `# メール送信サービス連携仕様
SendGrid API を利用したトランザクションメールのテンプレート管理と配信停止処理。`
  },
  {
    path: 'features/notifications/push.md',
    content: `# Web Push 通知配信仕様
Firebase Cloud Messaging (FCM) トークンの登録・無効化とバッチ通知配信の仕様。`
  }
];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const fullPath = path.join(targetDir, file.path);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, file.content, 'utf8');
}

console.log(`Successfully generated ${files.length} fixture files in ${targetDir}`);
