import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrateCli } from '../src/migration/cli.ts';

const fixtureDir = path.resolve(process.cwd(), 'tests/fixtures/sample-legacy-project');

function snapshot(dir: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else result[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return result;
}

describe('migrate CLI', () => {
  let dir: string;
  const run = (...args: string[]) => runMigrateCli([...args, '--root', dir], dir);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-migrate-'));
    fs.cpSync(fixtureDir, dir, { recursive: true });
    fs.mkdirSync(path.join(dir, '.zoomdoc'), { recursive: true });
    // Use the destination folder names in expected-plan-a.json as the classification as they are
    const expected: Record<string, string> = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'expected-plan-a.json'), 'utf8')
    );
    const extracted = Object.entries(expected).map(([from, to]) => ({
      path: from,
      title: path.basename(to, '.md'),
      summary: `summary of ${from}`,
      category: path.basename(path.dirname(to))
    }));
    fs.writeFileSync(path.join(dir, 'extracted.json'), JSON.stringify(extracted));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('runs scan -> plan -> dry-run -> apply -> log -> rollback without custom code', () => {
    const scan = run('scan', '--chunks', '3');
    expect(scan.exitCode).toBe(0);
    const scanned = JSON.parse(scan.stdout);
    expect(scanned.safety.fileCount).toBe(25);
    expect(scanned.chunks.flat().length).toBe(25);

    const proposed = JSON.parse(run('plan', '--extracted', 'extracted.json').stdout);
    expect(proposed.recommendation.planType).toBe('plan_c_hybrid');
    expect(proposed.recommendation.reason).toBeTruthy();
    const proposals = proposed.proposals;
    expect(proposals.map((p: { planType: string }) => p.planType)).toEqual([
      'plan_a_rigid',
      'plan_b_preserve',
      'plan_c_hybrid'
    ]);

    const planned = run(
      'plan',
      '--extracted',
      'extracted.json',
      '--type',
      'a',
      '--out',
      'plan.json'
    );
    expect(planned.exitCode).toBe(0);

    const before = snapshot(dir);
    const dry = run('dry-run', '--plan', 'plan.json');
    expect(dry.exitCode).toBe(0);
    expect(dry.stdout).toContain('docs/setup.md -> docs/guides/setup.md');
    expect(snapshot(dir)).toEqual(before); // dry-run changes nothing

    const applied = run('apply', '--plan', 'plan.json');
    expect(applied.exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, 'docs/guides/setup.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'docs/setup.md'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'docs/guides/setup.md'), 'utf8')).toContain(
      'description: "summary of docs/setup.md"'
    );

    const log = JSON.parse(run('log', '--json').stdout);
    expect(log.changes.length).toBe(25);

    expect(run('rollback').exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, 'docs/setup.md'))).toBe(true);
  });

  it('rejects invalid input with a non-zero exit code', () => {
    expect(run('plan').exitCode).toBe(1);
    expect(run('dry-run', '--plan', 'missing.json').exitCode).toBe(1);
    expect(run('bogus').exitCode).toBe(1);

    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify([{ path: 'a.md', title: 't' }]));
    const res = run('plan', '--extracted', 'bad.json');
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toContain('category');
  });

  it('detects destination collisions before applying', () => {
    const extracted = [
      { path: 'docs/a/x.md', title: 'x', summary: '', category: 'guides' },
      { path: 'docs/b/x.md', title: 'x', summary: '', category: 'guides' }
    ];
    fs.writeFileSync(path.join(dir, 'dup.json'), JSON.stringify(extracted));
    const res = run('plan', '--extracted', 'dup.json');
    expect(res.exitCode).toBe(1);
    expect(res.stdout).toContain('collision');
  });
});
