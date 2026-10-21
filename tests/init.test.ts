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

describe('Adoption helpers (survey, layout, --schema-file)', () => {
  const dir = path.resolve('/tmp/test_zoomdoc_adoption');
  const init = path.resolve('scripts/init.js');
  const run = (args: string) => execSync(`node "${init}" ${args}`, { encoding: 'utf8' });
  const write = (rel: string, body = '# x\n') => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };
  const fresh = () => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  };

  it('survey reports an empty project as a fresh start and writes nothing', () => {
    fresh();
    try {
      const out = run(`survey "${dir}"`);
      expect(out).toContain('Documents found: 0');
      expect(out).toContain('fresh start');
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('survey groups documents by folder and skips generated and standard files', () => {
    fresh();
    try {
      write('README.md');
      write('design/a.md');
      write('design/b.md');
      write('howto/c.md');
      write('node_modules/pkg/readme.md');
      write('dist/gen.md');
      const json = JSON.parse(run(`survey "${dir}" --json`));
      expect(json.totalDocs).toBe(3);
      expect(json.folders).toEqual([
        { folder: 'design', count: 2 },
        { folder: 'howto', count: 1 }
      ]);
      expect(json.rootFiles).toEqual(['README.md']);
      expect(json.excluded).toEqual(['dist', 'node_modules']);
      expect(json.hasSchema).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('layout prints the recommended layout as a directory tree', () => {
    const out = run('layout');
    expect(out.split('\n')[0]).toBe('docs/');
    expect(out).toContain('├── product/');
    expect(out).toContain('└── archive/');
    expect(run('layout --docs-root documentation').split('\n')[0]).toBe('documentation/');
  });

  it('deploy installs the approved schema file, and refuses one without folders', () => {
    fresh();
    try {
      write(
        'approved.yaml',
        'version: "3.0"\nfolders:\n  notes/design:\n    description: Design notes.\n'
      );
      run(`"${dir}" --schema-file "${path.join(dir, 'approved.yaml')}"`);
      const installed = fs.readFileSync(path.join(dir, '.zoomdoc', 'schema.yaml'), 'utf8');
      expect(installed).toContain('notes/design:');

      fresh();
      write('bad.yaml', 'version: "3.0"\n');
      expect(() => run(`"${dir}" --schema-file "${path.join(dir, 'bad.yaml')}"`)).toThrow();
      expect(fs.existsSync(path.join(dir, '.zoomdoc', 'schema.yaml'))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
