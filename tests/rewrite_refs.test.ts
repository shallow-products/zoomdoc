import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrationPlan, rollbackMigration } from '../src/migration/apply.ts';
import { findBrokenLinks, planReferenceRewrites } from '../src/migration/rewrite_refs.ts';

const FILES: Record<string, string> = {
  'README.md': [
    '# Project',
    '',
    '[setup](docs/setup.md#install) and [api](./docs/api.md)',
    '[ext](https://example.com/docs/setup.md) [anchor](#top)',
    'See `docs/setup.md` for details.',
    '```',
    '[in code](docs/setup.md)',
    'docs/setup.md',
    '```',
    '[ref]: docs/api.md'
  ].join('\n'),
  'docs/setup.md': '# Setup\n\nBack to [readme](../README.md) and [api](api.md).\n',
  'docs/api.md': '# API\n\n[setup](setup.md) [missing](nope.md)\n',
  'src/a.ts': "// see docs/setup.md\nconst x = 'docs/setup.md.bak';\n"
};

const ACTIONS = [
  { from: 'docs/setup.md', to: 'docs/guides/setup.md', title: 'Setup', description: 'd' },
  { from: 'docs/api.md', to: 'docs/reference/api.md', title: 'API', description: 'd' }
];

describe('reference rewriting', () => {
  let dir: string;
  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-refs-'));
    for (const [rel, content] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('dry-run lists changes without touching files', () => {
    const log = applyMigrationPlan(
      dir,
      { planType: 'plan_a_rigid', actions: ACTIONS },
      { dryRun: true }
    );
    expect(log.referenceChanges?.length).toBeGreaterThan(0);
    expect(read('README.md')).toBe(FILES['README.md']);
    expect(fs.existsSync(path.join(dir, 'docs/setup.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, '.zoomdoc/migration-log.json'))).toBe(false);
  });

  it('rewrites links, anchors, ref definitions, inline paths and code comments', () => {
    applyMigrationPlan(dir, { planType: 'plan_a_rigid', actions: ACTIONS });

    const readme = read('README.md');
    expect(readme).toContain('[setup](docs/guides/setup.md#install)');
    expect(readme).toContain('[api](./docs/reference/api.md)');
    expect(readme).toContain('[ref]: docs/reference/api.md');
    expect(readme).toContain('`docs/guides/setup.md`');
    // External URLs and fenced code blocks are out of scope
    expect(readme).toContain('https://example.com/docs/setup.md');
    expect(readme).toContain('[in code](docs/setup.md)\ndocs/setup.md\n```');

    // Relative links inside the moved file are fixed to match the new positions
    expect(read('docs/guides/setup.md')).toContain('[readme](../../README.md)');
    expect(read('docs/guides/setup.md')).toContain('[api](../reference/api.md)');
    expect(read('docs/reference/api.md')).toContain('[setup](../guides/setup.md)');

    // Code comments are replaced, and a part of another path (.bak) is left alone
    expect(read('src/a.ts')).toContain('// see docs/guides/setup.md');
    expect(read('src/a.ts')).toContain("'docs/setup.md.bak'");
  });

  it('leaves no new broken links and is idempotent', () => {
    const before = findBrokenLinks(dir).map((b) => b.target);
    expect(before).toContain('nope.md');

    const log = applyMigrationPlan(dir, { planType: 'plan_a_rigid', actions: ACTIONS });
    // Only nope.md, which was broken from the start, remains
    expect(log.brokenLinks?.map((b) => b.target)).toEqual(['nope.md']);

    // Applying the same mapping again to the post-move state produces no diff
    expect(planReferenceRewrites(dir, ACTIONS)).toEqual([]);
  });

  it('restores references on rollback', () => {
    applyMigrationPlan(dir, { planType: 'plan_a_rigid', actions: ACTIONS });
    rollbackMigration(dir);
    expect(read('README.md')).toBe(FILES['README.md']);
    expect(read('src/a.ts')).toBe(FILES['src/a.ts']);
    expect(read('docs/api.md')).toContain('[setup](setup.md)');
  });
});
