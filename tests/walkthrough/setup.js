#!/usr/bin/env node
/**
 * tests/walkthrough/setup.js
 * Create a throwaway sample project for walking through the skills.
 *   node tests/walkthrough/setup.js <store|migrate|migrate-root> <output directory>
 * Put the output outside the zoomdoc repository (for example ~/zoomdoc-walkthrough/...).
 * Inside the repository, the parent CLAUDE.md and schema would be picked up and spoil the result.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initZoomdoc } from '../../scripts/init.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const [scenario, outArg] = process.argv.slice(2);

const FIXTURE_SCENARIOS = ['store', 'search', 'dedupe', 'supersede', 'archive'];
if (![...FIXTURE_SCENARIOS, 'migrate', 'migrate-root'].includes(scenario) || !outArg) {
  console.error(
    'usage: node tests/walkthrough/setup.js <store|migrate|migrate-root|search|dedupe|supersede|archive> <dir>'
  );
  process.exit(1);
}
const out = path.resolve(outArg);
if (out === repoRoot || out.startsWith(`${repoRoot}${path.sep}`)) {
  console.error(`出力先は、リポジトリの外にしてください: ${out}`);
  process.exit(1);
}

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const listMd = (dir) => {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) found.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return found;
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const state = { scenario, createdAt: new Date().toISOString() };

if (FIXTURE_SCENARIOS.includes(scenario)) {
  initZoomdoc(out);
  state.schemaSha = sha(path.join(out, '.zoomdoc', 'schema.yaml'));
  if (scenario !== 'store') {
    const doc = (rel, title, description, body) => {
      const full = path.join(out, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(
        full,
        `---\ntitle: "${title}"\ndescription: "${description}"\n---\n\n# ${title}\n\n${body}\n`
      );
    };
    doc(
      'docs/decisions/2026-03-01-adopt-postgres.md',
      'メインDBに PostgreSQL 16 を採用する',
      'メインのデータストアを PostgreSQL 16 にした決定と理由',
      '## Decision\nメインDBは PostgreSQL 16。理由: JSONB と運用実績。'
    );
    doc(
      'docs/decisions/2026-04-10-session-tokens.md',
      'ログインセッションのトークン方式',
      'アクセストークンの有効期限と、更新トークンによる更新の仕組みの決定',
      '## Decision\nアクセストークン（JWT）の有効期限は15分。更新トークンは7日で、使うたびに回転（再発行）する。期限切れ後に更新トークンが再利用された場合は、そのセッションをすべて失効させる。'
    );
    doc(
      'docs/decisions/2026-05-20-queue-redis.md',
      'ジョブキューに Redis を使う',
      '非同期ジョブのキューを Redis で実装する決定',
      '## Decision\nジョブキューは Redis（BullMQ）。'
    );
    doc(
      'docs/guides/setup.md',
      '開発環境のセットアップ',
      'npm install と docker compose up による開発環境の初回セットアップ手順',
      '1. npm install\n2. docker compose up'
    );
    doc(
      'docs/guides/deploy-runbook.md',
      'デプロイ手順書',
      '本番へのデプロイ手順とロールバックの手順',
      '1. タグを打つ\n2. CI が本番へ配布する'
    );
    doc(
      'docs/architecture/overview.md',
      'システム全体像',
      'サービスの構成と、主要コンポーネントの関係',
      'API サーバー、ワーカー、PostgreSQL、Redis の4つで構成する。'
    );
    doc(
      'docs/architecture/tech-stack.md',
      '技術スタック',
      '採用している言語・フレームワーク・主要ライブラリの一覧',
      'TypeScript、Node.js 22、Fastify。'
    );

    if (scenario === 'supersede') {
      // An existing ADR is not rewritten when a decision is overturned (a new ADR is created)
      state.adrSha = sha(path.join(out, 'docs/decisions/2026-04-10-session-tokens.md'));
      state.decisions = fs.readdirSync(path.join(out, 'docs/decisions')).sort();
    }

    if (scenario === 'archive') {
      // A design note whose conclusion became a decision. The schema's remove says to move it to docs/archive once it has served its purpose
      doc(
        'docs/architecture/cache-spike.md',
        'キャッシュ方式の検証メモ',
        'APIレスポンスのキャッシュを、メモリとRedisで比べた検証の記録',
        '## 結果\nメモリは再起動で消える。Redis なら複数台で共有できる。'
      );
      fs.appendFileSync(
        path.join(out, 'docs/architecture/overview.md'),
        '\n検証メモ: [キャッシュ方式の検証](cache-spike.md)\n'
      );
      state.spikeSha = sha(path.join(out, 'docs/architecture/cache-spike.md'));
    }

    if (scenario === 'dedupe') {
      // The procedure goes in docs/operations, which the schema defines as the place for operations runbooks
      fs.mkdirSync(path.join(out, 'docs/operations'), { recursive: true });
      fs.renameSync(
        path.join(out, 'docs/guides/deploy-runbook.md'),
        path.join(out, 'docs/operations/deploy-runbook.md')
      );
      state.runbookSha = sha(path.join(out, 'docs/operations/deploy-runbook.md'));
      state.guides = fs.readdirSync(path.join(out, 'docs/operations')).sort();
    }
  }
} else {
  const legacyRoot = scenario === 'migrate' ? 'docs' : 'documentation';
  fs.cpSync(
    path.join(repoRoot, 'tests/fixtures/sample-legacy-project/docs'),
    path.join(out, legacyRoot),
    {
      recursive: true
    }
  );
  fs.mkdirSync(path.join(out, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(out, 'src', 'app.ts'),
    `// 認証の仕様は ${legacyRoot}/auth-flow.md を参照\nexport const app = 'sample';\n`
  );
  fs.writeFileSync(
    path.join(out, 'README.md'),
    `# Sample\n\n認証は [認証フロー](${legacyRoot}/auth-flow.md) を参照。\n`
  );
  state.legacyRoot = legacyRoot;
  state.mdCount = listMd(path.join(out, legacyRoot)).length;
}

fs.writeFileSync(path.join(out, '.walkthrough.json'), `${JSON.stringify(state, null, 2)}\n`);
console.log(`作成しました: ${out}`);
console.log(JSON.stringify(state));
