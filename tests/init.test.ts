import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - JavaScript script module without separate d.ts
import { initZoomdoc } from '../scripts/init.js';

describe('Initialization & Uninitialized Fail-Safe Suite', () => {
  const tempTestDir = path.resolve('/tmp/test_zoomdoc_init_e2e');

  it('scaffolds zoomdoc structure non-destructively in an uninitialized directory', () => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempTestDir, { recursive: true });

    try {
      // 1. Run initZoomdoc programmatically
      const res = initZoomdoc(tempTestDir);

      expect(res.created).toContain('.zoomdoc/schema.yaml');
      expect(fs.existsSync(path.join(tempTestDir, '.zoomdoc', 'schema.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(tempTestDir, '.zoomdoc', 'templates'))).toBe(true);
      // Folders are not created ahead of time (they are created when the first file is written)
      expect(fs.existsSync(path.join(tempTestDir, 'docs'))).toBe(false);

      // 2. Non-destructive check: re-running should skip existing files
      const resSecond = initZoomdoc(tempTestDir);
      expect(resSecond.skipped).toContain('.zoomdoc/schema.yaml');
      expect(resSecond.created.length).toBe(0);
    } finally {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    }
  });

  it('CLI scripts/init.js works directly via node process execution', () => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempTestDir, { recursive: true });

    try {
      const initScript = path.resolve('scripts/init.js');
      const out = execSync(`node "${initScript}" "${tempTestDir}"`, { encoding: 'utf8' });

      expect(out).toContain('Initializing zoomdoc in:');
      expect(out).toContain('zoomdoc setup complete!');
      expect(fs.existsSync(path.join(tempTestDir, '.zoomdoc', 'schema.yaml'))).toBe(true);
    } finally {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    }
  });
});
