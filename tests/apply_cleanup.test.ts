import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrationPlan, rollbackMigration } from '../src/migration/apply.ts';

describe('apply cleans up the directories it emptied', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-apply-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  const plan = {
    planType: 'plan_a_rigid' as const,
    actions: [
      {
        from: 'docs/features/billing/pay.md',
        to: 'docs/guides/pay.md',
        title: 'Pay',
        description: 'pay'
      },
      {
        from: 'docs/features/intro.md',
        to: 'docs/guides/intro.md',
        title: 'Intro',
        description: 'intro'
      }
    ],
    directoryResponsibilities: []
  };

  it('removes emptied source directories, keeps non-empty ones, and rollback restores them', () => {
    write('docs/features/billing/pay.md', '# Pay\n');
    write('docs/features/intro.md', '# Intro\n');
    write('docs/other/keep.md', '# Keep\n');
    applyMigrationPlan(dir, plan);

    expect(fs.existsSync(path.join(dir, 'docs/features'))).toBe(false); // It became empty, so it was cleaned up
    expect(fs.existsSync(path.join(dir, 'docs/other/keep.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'docs/guides/pay.md'))).toBe(true);

    rollbackMigration(dir);
    expect(fs.existsSync(path.join(dir, 'docs/features/billing/pay.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'docs/features/intro.md'))).toBe(true);
  });

  it('keeps a source directory that still holds other files', () => {
    write('docs/features/billing/pay.md', '# Pay\n');
    write('docs/features/intro.md', '# Intro\n');
    write('docs/features/notes.txt', 'x');
    applyMigrationPlan(dir, plan);
    expect(fs.existsSync(path.join(dir, 'docs/features/notes.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'docs/features/billing'))).toBe(false);
  });
});

describe('apply and rollback refuse paths outside the project root', () => {
  let dir: string;
  let outside: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-outside-'));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs/a.md'), '# A\n');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'keep');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('apply rejects a destination outside the root and changes nothing', () => {
    const outsidePath = path.relative(dir, path.join(outside, 'x.md'));
    const plan = {
      planType: 'plan_a_rigid' as const,
      actions: [{ from: 'docs/a.md', to: outsidePath, title: 'A', description: 'a' }]
    };
    expect(() => applyMigrationPlan(dir, plan)).toThrow(/escapes the project root/);
    expect(fs.existsSync(path.join(dir, 'docs/a.md'))).toBe(true);
    expect(fs.existsSync(path.join(outside, 'x.md'))).toBe(false);
  });

  it('apply rejects a source outside the root and does not delete it', () => {
    const outsidePath = path.relative(dir, path.join(outside, 'secret.txt'));
    const plan = {
      planType: 'plan_a_rigid' as const,
      actions: [{ from: outsidePath, to: 'docs/b.md', title: 'B', description: 'b' }]
    };
    expect(() => applyMigrationPlan(dir, plan)).toThrow(/escapes the project root/);
    expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('keep');
  });

  it('rollback rejects a log that points outside the root', () => {
    fs.mkdirSync(path.join(dir, '.zoomdoc'), { recursive: true });
    const outsidePath = path.relative(dir, path.join(outside, 'secret.txt'));
    fs.writeFileSync(
      path.join(dir, '.zoomdoc/migration-log.json'),
      JSON.stringify({ changes: [{ from: 'docs/a.md', to: outsidePath }] })
    );
    expect(() => rollbackMigration(dir)).toThrow(/escapes the project root/);
    expect(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8')).toBe('keep');
  });
});
