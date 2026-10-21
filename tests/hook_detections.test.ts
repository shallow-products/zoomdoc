import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findDuplicateTitles,
  findMissingTemplates,
  findStructureIssues
} from '../scripts/structure_check.js';

const HOOK = path.resolve(__dirname, '../scripts/hooks/detect-issues.js');

describe('structure checks', () => {
  let dir: string;
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  const doc = (title: string, body = 'ok') =>
    `---\ntitle: ${title}\ndescription: d\n---\n${body}\n`;
  const run = (...args: string[]) =>
    execFileSync('node', [HOOK, '--env=claude', ...args], { cwd: dir, encoding: 'utf8' });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-detect-'));
    write(
      '.zoomdoc/schema.yaml',
      'version: "2.0"\nfolders:\n  docs/guides:\n    description: |\n      guides\n  docs/decisions:\n    description: |\n      decisions\n'
    );
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('findStructureIssues: folders outside the schema and nested subdirectories', () => {
    write('docs/guides/a.md', doc('a'));
    write('docs/guides/api/b.md', doc('b'));
    write('docs/misc/c.md', doc('c'));
    write('docs/empty/.gitkeep', '');
    const r = findStructureIssues(dir, 'docs', ['docs/guides', 'docs/decisions']);
    expect(r.unmanaged.map((u) => u.dir)).toEqual(['docs/misc']);
    expect(r.nested).toEqual(['docs/guides/api']);
  });

  it('findDuplicateTitles: same title in the same folder only', () => {
    const groups = findDuplicateTitles([
      { path: 'docs/guides/a.md', folder: 'docs/guides', title: 'Deploy' },
      { path: 'docs/guides/b.md', folder: 'docs/guides', title: 'Deploy' },
      { path: 'docs/decisions/c.md', folder: 'docs/decisions', title: 'Deploy' },
      { path: 'docs/guides/d.md', folder: 'docs/guides', title: 'Other' }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].paths).toEqual(['docs/guides/a.md', 'docs/guides/b.md']);
  });

  it('findMissingTemplates: only referenced templates that do not exist', () => {
    write('.zoomdoc/templates/there.md', '# t\n');
    const text =
      'folders:\n  docs/guides:\n    description: |\n      雛形 .zoomdoc/templates/there.md と .zoomdoc/templates/gone.md\n';
    expect(findMissingTemplates(dir, text)).toEqual([
      { folder: 'docs/guides', template: '.zoomdoc/templates/gone.md' }
    ]);
  });

  it('hook reports a document outside the schema folders, once', () => {
    write('docs/guides/a.md', doc('a'));
    write('docs/misc/c.md', doc('c'));
    const first = run();
    expect(first).toContain('docs/misc/');
    expect(run()).toBe('');
    fs.rmSync(path.join(dir, 'docs/misc'), { recursive: true });
    expect(run()).toBe('');
  });

  it('hook reports duplicate titles in a folder', () => {
    write('docs/guides/deploy.md', doc('Deploy'));
    write('docs/guides/deployment.md', doc('Deploy'));
    const out = run();
    expect(out).toContain('share a title');
    expect(out).toContain('desired state');
    expect(out).toContain('docs/guides/deploy.md');
    expect(out).toContain('docs/guides/deployment.md');
  });

  it('hook reports a missing template referenced by the schema', () => {
    write(
      '.zoomdoc/schema.yaml',
      'folders:\n  docs/guides:\n    description: |\n      雛形 .zoomdoc/templates/nope.md\n'
    );
    write('docs/guides/a.md', doc('a'));
    expect(run()).toContain('.zoomdoc/templates/nope.md');
  });

  it('hook stays silent for a clean project', () => {
    write('docs/guides/a.md', doc('a'));
    write('docs/decisions/b.md', doc('b'));
    expect(run('--force')).toBe('');
  });
});
