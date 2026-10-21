import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSchemaGaps } from '../src/migration/gaps.ts';
import { loadSchema } from '../src/schema_loader.ts';

const schema = loadSchema(path.resolve(__dirname, '..'));

describe('schema gaps', () => {
  it('defines every folder the init command recommends', () => {
    for (const dir of ['architecture', 'guides', 'operations', 'archive', 'references']) {
      expect(schema?.folders[`docs/${dir}`], dir).toBeDefined();
    }
  });

  it('does not interpret descriptions: only unauthorized folders are gaps', () => {
    const gaps = analyzeSchemaGaps(schema, [
      { to: 'docs/decisions/0007-anything.md' },
      { to: 'docs/decisions/whatever.md' },
      { to: 'docs/guides/description.md' }
    ]);
    expect(gaps).toEqual([]);
  });

  it('reports only unauthorized folders, once per folder', () => {
    const gaps = analyzeSchemaGaps(schema, [
      { to: 'docs/archive/old-memo.md' },
      { to: 'docs/misc/stuff.md' },
      { to: 'docs/misc/more.md' },
      { to: 'README.md' }
    ]);
    expect(gaps.map((g) => `${g.type}:${g.target}`)).toEqual(['UNAUTHORIZED_FOLDER:docs/misc']);
    expect(gaps[0].suggestion).toContain('docs/misc');
  });
});
