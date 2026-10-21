import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSchema, referencedTemplates } from '../src/schema_loader.ts';

describe('Schema & Template Integrity', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const schemaPath = path.join(projectRoot, '.zoomdoc', 'schema.yaml');

  it('verifies that schema.yaml exists and is valid YAML', () => {
    expect(fs.existsSync(schemaPath)).toBe(true);
    const parsed = loadSchema(projectRoot);
    expect(parsed).toBeDefined();
    expect(parsed?.folders).toBeDefined();
  });

  it('verifies that every template referenced in the folder descriptions exists on disk', () => {
    const refs = referencedTemplates(loadSchema(projectRoot));
    expect(refs.length).toBeGreaterThan(0);
    const missing = refs.filter((r) => !fs.existsSync(path.join(projectRoot, r)));
    expect(missing, `Missing templates: ${missing.join(', ')}`).toEqual([]);
  });
});
