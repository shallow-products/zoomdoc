import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectAnchors, githubSlug } from '../scripts/link_check.js';

const SCRIPT = path.resolve(__dirname, '../scripts/doc_lint.js');
const FM =
  '---\ntitle: t\ndescription: d\ncreated_at: "2026-01-01"\nupdated_at: "2026-01-01"\n---\n';

describe('doc-lint CLI', () => {
  let dir: string;
  const lint = (...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, CI: '' }
    });
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  const read = (rel: string) => fs.readFileSync(path.join(dir, rel), 'utf8');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-lint-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const initProject = () => {
    write(
      '.zoomdoc/schema.yaml',
      'version: "1.0"\nfolders:\n  docs/guides:\n    description: "g"\n'
    );
  };

  it('reports document entries missing required fields and missing templates', () => {
    write(
      '.zoomdoc/schema.yaml',
      [
        'folders:',
        '  docs/guides:',
        '    description: g',
        '    documents:',
        '      - name: setup.md',
        '        description: 手順',
        '        create: 確立したとき。',
        '        update: 変わったとき。',
        '        template: .zoomdoc/templates/there.md',
        '      - name: <task>.md',
        '        description: ほかの手順',
        '        create: 確立したとき。',
        '        template: .zoomdoc/templates/gone.md',
        ''
      ].join('\n')
    );
    write('.zoomdoc/templates/there.md', '# t\n');
    const res = lint();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('SCHEMA_MISSING_DOCUMENT_FIELD');
    expect(res.stdout).toContain('update');
    expect(res.stdout).toContain('.zoomdoc/templates/gone.md');
    expect(res.stdout).not.toContain('templates/there.md"');
  });

  it('reports a schema whose folder keys the hooks cannot read', () => {
    // Four-space indent: valid YAML, but the hooks' line-based parser cannot read it
    write(
      '.zoomdoc/schema.yaml',
      ['folders:', '    docs/guides:', '        description: g', ''].join('\n')
    );
    const res = lint();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('SCHEMA_PARSE_MISMATCH');
    expect(res.stdout).toContain('docs/guides');
  });

  it('accepts complete document entries', () => {
    write(
      '.zoomdoc/schema.yaml',
      [
        'folders:',
        '  docs/guides:',
        '    description: g',
        '    documents:',
        '      - name: setup.md',
        '        description: 手順',
        '        create: 確立したとき。',
        '        update: 更新しない（記録）。',
        ''
      ].join('\n')
    );
    write('docs/guides/setup.md', `${FM}ok\n`);
    const res = lint();
    expect(res.status).toBe(0);
  });

  it('explains an uninitialized project without creating anything', () => {
    write('docs/a.md', '# A\n');
    const res = lint();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('/zoomdoc:init');
    expect(fs.existsSync(path.join(dir, '.zoomdoc'))).toBe(false);
  });

  it('verifies anchors and ignores links inside code', () => {
    initProject();
    write(
      'docs/guides/a.md',
      `${FM}# A\n\n## 設計方針\n\n## Dup\n\n## Dup\n\n[ok](#設計方針) [ok2](b.md#target-heading) [dup](#dup-1)\n[bad](#nope) [bad2](b.md#missing)\n\`[code](gone.md)\`\n\n\`\`\`\n[fenced](gone.md#x)\n\`\`\`\n`
    );
    write('docs/guides/b.md', `${FM}# B\n\n## Target Heading\n`);
    const res = lint();
    expect(res.status).toBe(1);
    const anchorLines = res.stdout.split('\n').filter((l) => l.includes('BROKEN_ANCHOR_LINK'));
    expect(anchorLines.length).toBe(2);
    expect(res.stdout).toContain('#nope');
    expect(res.stdout).toContain('b.md#missing');
    expect(res.stdout).not.toContain('gone.md');
  });

  it('warns about hidden and temporary files without failing', () => {
    initProject();
    write('docs/guides/long.md', `${FM}# L\n\n${'line\n'.repeat(500)}`); // Line count is not subject to a warning
    write('docs/guides/.DS_Store', 'x');
    write('docs/guides/old.md~', 'x');
    const res = lint();
    expect(res.status).toBe(0);
    expect(res.stdout).not.toContain('long.md');
    expect(res.stdout).toContain('HIDDEN_OR_TEMP_FILE');
  });

  it('reports missing frontmatter fields and never writes to documents', () => {
    initProject();
    const partial = '---\ntitle: P\n---\n# P\n\nFirst paragraph.\n';
    const none = '# N\n\nSecond paragraph.\n';
    write('docs/guides/partial.md', partial);
    write('docs/guides/none.md', none);

    const res = lint();
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('MISSING_REQUIRED_FIELD');
    expect(res.stdout).toContain('MISSING_FRONTMATTER');
    expect(read('docs/guides/partial.md')).toBe(partial);
    expect(read('docs/guides/none.md')).toBe(none);
  });

  it('takes no options: --fix and --strict change nothing', () => {
    initProject();
    write('docs/guides/none.md', '# N\n\nbody\n');
    write('docs/guides/.DS_Store', 'x');
    expect(lint('--fix').status).toBe(1);
    expect(read('docs/guides/none.md')).toBe('# N\n\nbody\n');
    write('docs/guides/none.md', `${FM}# N\n`);
    expect(lint('--strict').status).toBe(0);
  });
});

describe('link_check helpers', () => {
  it('builds GitHub-compatible slugs and numbers duplicates', () => {
    expect(githubSlug('Hello, World!')).toBe('hello-world');
    expect(githubSlug('設計方針 (v2)')).toBe('設計方針-v2');
    expect(githubSlug('`code` and [link](x.md)')).toBe('code-and-link');
    const anchors = collectAnchors(
      '# A\n## A\n## A\n<a id="Custom"></a>\n```\n# not heading\n```\n'
    );
    expect([...anchors].sort()).toEqual(['a', 'a-1', 'a-2', 'custom']);
  });
});
