import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import yaml from 'yaml';
import {
  deriveDocsRoot,
  findMultipleRoots,
  getDocsRoot,
  normalizeDocsRoot,
  parseSchemaFolderKeys,
  rebaseSchemaText
} from '../scripts/docs_root.js';
// @ts-expect-error - JavaScript script module without separate d.ts
import { initZoomdoc } from '../scripts/init.js';
import { analyzeSchemaGaps } from '../src/migration/gaps.ts';
import { buildMigrationProposals } from '../src/migration/planner.ts';

describe('docsRoot', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-root-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('normalizes input and rejects paths outside the project', () => {
    expect(normalizeDocsRoot('./documentation/')).toBe('documentation');
    expect(normalizeDocsRoot('doc\\specs')).toBe('doc/specs');
    for (const bad of ['', '.', '/abs', '../up', 'a/../b', 'C:/x']) {
      expect(() => normalizeDocsRoot(bad)).toThrow();
    }
  });

  it('derives the root from the schema folder names, falling back to docs', () => {
    expect(deriveDocsRoot(['documentation/product', 'documentation/guides'])).toBe('documentation');
    expect(deriveDocsRoot(['docs/a', 'docs/a/b'])).toBe('docs');
    expect(deriveDocsRoot(['docs/product', 'wiki/guides'])).toBeNull();
    expect(deriveDocsRoot(['product'])).toBeNull();
    expect(
      parseSchemaFolderKeys('version: 1\nfolders:\n  wiki/a:\n    x: 1\n  wiki/b:\nother:\n')
    ).toEqual(['wiki/a', 'wiki/b']);

    expect(getDocsRoot(dir)).toBe('docs'); // No schema
    fs.mkdirSync(path.join(dir, '.zoomdoc'));
    fs.writeFileSync(path.join(dir, '.zoomdoc/schema.yaml'), 'folders:\n  wiki/a:\n  wiki/b:\n');
    expect(getDocsRoot(dir)).toBe('wiki');
    fs.writeFileSync(path.join(dir, '.zoomdoc/schema.yaml'), 'folders:\n  wiki/a:\n  docs/b:\n');
    expect(getDocsRoot(dir)).toBe('docs'); // Falls back to the default when undecided
    expect(findMultipleRoots(['wiki/a', 'docs/b']).sort()).toEqual(['docs', 'wiki']);
    expect(findMultipleRoots(['wiki/a', 'wiki/b'])).toEqual([]);
  });

  it('doc-lint and the hook warn when schema folders are spread over several roots', () => {
    initZoomdoc(dir, { docsRoot: 'documentation' });
    fs.appendFileSync(
      path.join(dir, '.zoomdoc/schema.yaml'),
      '  stray/notes:\n    description: x\n'
    );
    const lint = execFileSync('node', [path.resolve('dist/doc_lint.js')], {
      cwd: dir,
      encoding: 'utf8'
    });
    expect(lint).toContain('SCHEMA_MULTIPLE_ROOTS');
    const hook = execFileSync(
      'node',
      [path.resolve('scripts/hooks/detect-issues.js'), '--env=claude'],
      {
        cwd: dir,
        encoding: 'utf8'
      }
    );
    expect(hook).toContain('several roots');
  });

  it('rebases only the folder keys of schema.yaml', () => {
    const src = 'folders:\n  docs/product:\n    description: "see docs/guides"\n  docs/guides:\n';
    expect(rebaseSchemaText(src, 'wiki')).toBe(
      'folders:\n  wiki/product:\n    description: "see docs/guides"\n  wiki/guides:\n'
    );
    expect(rebaseSchemaText(src, 'docs')).toBe(src);
  });

  it('init scaffolds under the chosen root and doc-lint passes there', () => {
    initZoomdoc(dir, { docsRoot: 'documentation' });
    expect(fs.existsSync(path.join(dir, 'documentation'))).toBe(false); // Folders are not created ahead of time
    expect(fs.existsSync(path.join(dir, 'docs'))).toBe(false);
    const schema = fs.readFileSync(path.join(dir, '.zoomdoc/schema.yaml'), 'utf8');
    expect(schema).toContain('  documentation/product:');
    expect(schema).not.toMatch(/^ {2}docs\//m);
    expect(getDocsRoot(dir)).toBe('documentation');

    fs.mkdirSync(path.join(dir, 'documentation/product'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'documentation/product/a.md'),
      '---\ntitle: A\ndescription: a\n---\n\n# A\n'
    );
    const out = execFileSync('node', [path.resolve('dist/doc_lint.js')], {
      cwd: dir,
      encoding: 'utf8'
    });
    expect(out).toContain('PASS');
  });

  it('plans destinations under the chosen root', () => {
    const docs = [
      { path: 'wiki/a.md', title: 'A', summary: 'a', category: 'guides' as const },
      { path: 'wiki/old.md', title: 'O', summary: 'o', category: 'archive' as const }
    ];
    const [a, , c] = buildMigrationProposals(docs, 'documentation');
    expect(a.actions.map((x) => x.to)).toEqual([
      'documentation/guides/a.md',
      'documentation/archive/old.md'
    ]);
    expect(c.actions[1].to).toBe('documentation/archive/old.md');
    expect(a.directoryResponsibilities.map((r) => r.dir)).toContain('documentation/guides');
    expect(
      analyzeSchemaGaps(
        { folders: {} } as never,
        [{ to: 'documentation/guides/a.md' }],
        'documentation'
      )
    ).toHaveLength(1);
  });
});

describe('schema folder parsing is shared', () => {
  const real = fs.readFileSync(path.resolve('.zoomdoc/schema.yaml'), 'utf8');

  it('finds the same folders as a real YAML parser', () => {
    const expected = Object.keys(yaml.parse(real).folders);
    expect(parseSchemaFolderKeys(real)).toEqual(expected);
    const quoted = 'folders:\n  "my docs/a":\n    description: x\n  docs/b:\n    description: y\n';
    expect(parseSchemaFolderKeys(quoted)).toEqual(Object.keys(yaml.parse(quoted).folders));
  });
});
