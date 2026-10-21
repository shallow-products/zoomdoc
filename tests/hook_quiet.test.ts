import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HOOKS = path.resolve(__dirname, '../scripts/hooks');

describe('hooks stay quiet when nothing changed', () => {
  let dir: string;
  const run = (hook: string, ...args: string[]) =>
    execFileSync('node', [path.join(HOOKS, hook), '--env=claude', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, ZOOMDOC_DISABLE_HOOKS: process.env.TEST_DISABLE ?? '' }
    });
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  const FM =
    '---\ntitle: t\ndescription: d\ncreated_at: "2026-01-01"\nupdated_at: "2026-01-01"\n---\n';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-hook-'));
    write(
      '.zoomdoc/schema.yaml',
      'version: "1.0"\nfolders:\n  docs/guides:\n    description: "g"\n'
    );
    process.env.TEST_DISABLE = '';
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.TEST_DISABLE = '';
  });

  it('detect-issues reports a broken link once, again on --force or when the problem changes', () => {
    write('docs/guides/a.md', `${FM}[x](missing.md)\n`);
    expect(run('detect-issues.js')).toContain('missing.md');
    expect(run('detect-issues.js')).toBe(''); // The same finding is not re-notified
    expect(run('detect-issues.js', '--force')).toContain('missing.md'); // It is shown at session start

    write('docs/guides/a.md', `${FM}[x](other-missing.md)\n`);
    expect(run('detect-issues.js')).toContain('other-missing.md');

    write('docs/guides/a.md', `${FM}ok\n`);
    expect(run('detect-issues.js')).toBe('');
  });

  it('detect-issues judges links like doc-lint (titles, %20, schemes, ~~~ fences, anchors, reference definitions)', () => {
    write('docs/guides/b.md', `${FM}# B\n`);
    write('docs/guides/my file.md', `${FM}# M\n`);
    write(
      'docs/guides/a.md',
      [
        FM,
        '# A',
        '[ok](b.md "tooltip-xyz") [enc](my%20file.md) [tel](tel:+81) [cdn](//cdn.example.com/x)',
        '[good anchor](b.md#b)',
        '~~~',
        '[fenced](nope.md)',
        '~~~',
        '[bad anchor](b.md#no-such-heading)',
        '[ref]: gone.md',
        ''
      ].join('\n')
    );
    const out = run('detect-issues.js');
    expect(out).toContain('b.md#no-such-heading');
    expect(out).toContain('gone.md');
    for (const fine of ['tooltip-xyz', 'my%20file', 'tel:', 'cdn.example', 'nope.md', '#b)']) {
      expect(out).not.toContain(fine);
    }
  });

  it('detect-issues reports missing fields, once, and not again until they change', () => {
    write('docs/guides/a.md', '# A\n\nno frontmatter\n');
    const first = run('detect-issues.js');
    expect(first).toContain('docs/guides/a.md: now: no front matter');
    expect(run('detect-issues.js')).toBe('');
    expect(run('detect-issues.js', '--force')).toContain('docs/guides/a.md');

    // Nothing was rewritten
    expect(fs.readFileSync(path.join(dir, 'docs/guides/a.md'), 'utf8')).toBe(
      '# A\n\nno frontmatter\n'
    );

    write('docs/guides/b.md', '# B\n');
    expect(run('detect-issues.js')).toContain('docs/guides/b.md');
  });

  it('re-notifies an unresolved issue after N silent prompts, and a new session resets the count', () => {
    write('docs/guides/a.md', `${FM}[x](missing.md)\n`);
    write('.zoomdoc/config.json', JSON.stringify({ hooks: { renotifyEvery: 3 } }));
    expect(run('detect-issues.js')).toContain('missing.md'); // First time: a new finding
    expect(run('detect-issues.js')).toBe('');
    expect(run('detect-issues.js')).toBe('');
    expect(run('detect-issues.js')).toContain('missing.md'); // Re-notified after three silent prompts
    expect(run('detect-issues.js')).toBe('');

    expect(run('detect-issues.js', '--force')).toContain('missing.md'); // The count restarts at session start
    expect(run('detect-issues.js')).toBe('');
    expect(run('detect-issues.js')).toBe('');
    expect(run('detect-issues.js')).toContain('missing.md');

    // Once fixed, no re-notification either
    write('docs/guides/a.md', `${FM}ok\n`);
    expect(run('detect-issues.js')).toBe('');
    for (let i = 0; i < 5; i++) expect(run('detect-issues.js')).toBe('');
  });

  it('renotifyEvery: 0 turns re-notification off', () => {
    write('docs/guides/a.md', `${FM}[x](missing.md)\n`);
    write('.zoomdoc/config.json', JSON.stringify({ hooks: { renotifyEvery: 0 } }));
    expect(run('detect-issues.js')).toContain('missing.md');
    for (let i = 0; i < 15; i++) expect(run('detect-issues.js')).toBe('');
  });

  it('can be disabled per hook by config or environment', () => {
    write('docs/guides/a.md', `${FM}[x](missing.md)\n`);
    write('.zoomdoc/config.json', JSON.stringify({ hooks: { 'detect-issues': false } }));
    expect(run('detect-issues.js')).toBe('');

    fs.rmSync(path.join(dir, '.zoomdoc/config.json'));
    process.env.TEST_DISABLE = 'detect-issues';
    expect(run('detect-issues.js')).toBe('');
    process.env.TEST_DISABLE = '';
    expect(run('detect-issues.js')).toContain('missing.md');
  });

  it('works from a plugin path with spaces and non-ASCII characters', () => {
    const plugin = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc plugin ')); // Contains a space
    const copy = path.join(plugin, 'プラグイン');
    fs.cpSync(path.resolve(HOOKS, '..'), path.join(copy, 'scripts'), { recursive: true });
    write('docs/guides/a.md', `${FM}[x](missing.md)\n`); // If there is a finding, detect-issues prints too
    for (const hook of ['sync-triggers.js', 'detect-issues.js', 'run.js']) {
      const out = execFileSync(
        'node',
        [path.join(copy, 'scripts', 'hooks', hook), '--env=claude', '--force'],
        { cwd: dir, encoding: 'utf8' }
      );
      expect(out, hook).toContain(hook === 'sync-triggers.js' ? 'zoomdoc Notice' : 'missing.md');
    }
    fs.rmSync(plugin, { recursive: true, force: true });
  });

  it('Antigravity: the first invocation forces both the notice and existing issues', () => {
    write('docs/guides/a.md', `${FM}[x](missing.md)\n`);
    const first = JSON.stringify({ invocationNum: 1 });
    const run1 = (extra: string[], input: string) =>
      execFileSync('node', [path.join(HOOKS, 'run.js'), '--env=agy', ...extra], {
        cwd: dir,
        encoding: 'utf8',
        input
      });
    const a = run1([], first);
    expect(a).toContain('missing.md');
    expect(a).toContain('zoomdoc Notice');
    // The second invocation (invocationNum 2) stays silent if nothing changed
    expect(run1([], JSON.stringify({ invocationNum: 2 }))).toBe('');
    // The start of a new conversation shows it again
    expect(run1([], first)).toContain('missing.md');
  });

  it('does not register hooks on PostToolUse', () => {
    for (const rel of ['hooks/hooks.json', 'hooks.json']) {
      const text = fs.readFileSync(path.resolve(HOOKS, '../..', rel), 'utf8');
      expect(text).not.toContain('PostToolUse');
    }
  });
});
