import fs from 'node:fs';
import path from 'node:path';
import { applyMigrationPlan } from '../src/migration/apply.js';
import { buildJudgePrompt } from '../src/migration/judge.js';
import { listMarkdownFiles, readHeadAndTail } from '../src/migration/scanner.js';

// 1. Prepare the test fixtures
const fixtureDir = path.resolve(process.cwd(), 'tests/fixtures/sample-legacy-project');
const tempProjectDir = path.resolve(process.cwd(), 'tests/fixtures/live-judge-run');

if (fs.existsSync(tempProjectDir)) {
  fs.rmSync(tempProjectDir, { recursive: true, force: true });
}
fs.cpSync(fixtureDir, tempProjectDir, { recursive: true });

// 2. Scan the 25 files
const scanned = listMarkdownFiles(tempProjectDir, 'docs').map((f) => {
  const { head } = readHeadAndTail(f.fullPath, 5, 0);
  return { path: f.relPath, excerpt: head };
});

// 3. Plan C (hybrid consolidation)
const planC = {
  planType: 'plan_c_hybrid',
  actions: scanned.map((item) => {
    const p = item.path;
    let target = p;

    if (
      p.includes('memo_') ||
      p.includes('meeting_notes') ||
      p.includes('temp_scratch') ||
      p.includes('draft_v1') ||
      p.includes('todo_ideas')
    ) {
      target = `docs/archive/${path.basename(p)}`;
    } else if (
      p === 'docs/setup.md' ||
      p === 'docs/quickstart.md' ||
      p === 'docs/troubleshooting.md' ||
      p === 'docs/faq.md' ||
      p === 'docs/tips.md'
    ) {
      target = `docs/guides/${path.basename(p)}`;
    } else if (
      p === 'docs/architecture.md' ||
      p === 'docs/db-schema.md' ||
      p === 'docs/api-specs.md' ||
      p === 'docs/security.md' ||
      p === 'docs/events.md' ||
      p === 'docs/auth-flow.md'
    ) {
      target = `docs/architecture/${path.basename(p)}`;
    }

    return {
      from: p,
      to: target,
      title: path.basename(p, '.md').replace(/[-_]/g, ' '),
      description: item.excerpt.split('\n')[1] || item.excerpt.split('\n')[0]
    };
  }),
  directoryResponsibilities: [
    {
      dir: 'docs/architecture',
      title: 'Architecture Specifications',
      description: 'システムアーキテクチャ、DB設計、APIおよび認証仕様'
    },
    {
      dir: 'docs/guides',
      title: 'Developer Guides',
      description: '環境構築、クイックスタート、トラブルシューティング手順'
    },
    {
      dir: 'docs/operations',
      title: 'Operations Manual',
      description: 'インフラ運用、デプロイ、監視および障害対応マニュアル'
    },
    {
      dir: 'docs/archive',
      title: 'Archived Documents',
      description: '過去の議事録、不採用ドラフト、古い検討メモ等の保管庫'
    },
    {
      dir: 'docs/features',
      title: 'Feature Specifications',
      description: '個別ドメイン機能（決済、通知等）の実装仕様'
    }
  ]
};

const migrationLog = applyMigrationPlan(tempProjectDir, planC);

const prompt = buildJudgePrompt({
  planType: 'plan_c_hybrid',
  preMigrationFiles: scanned,
  migrationLog: migrationLog.changes,
  generatedDescriptions: planC.directoryResponsibilities
});

fs.writeFileSync(
  path.resolve(process.cwd(), 'tests/fixtures/live-judge-prompt.txt'),
  prompt,
  'utf8'
);
console.log(
  'Generated Live Judge Prompt for Plan C. Files transformed:',
  migrationLog.changes.length
);
