import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import yaml from 'yaml';

const root = path.resolve(__dirname, '..');

/** Files with front matter for the skills the plugin loads */
function pluginMarkdown(): string[] {
  const files: string[] = [];
  for (const dir of fs.readdirSync(path.join(root, 'skills'))) {
    const f = path.join(root, 'skills', dir, 'SKILL.md');
    if (fs.existsSync(f)) files.push(f);
  }
  return files;
}

describe('skill frontmatter', () => {
  const files = pluginMarkdown();

  it('finds the skills', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of files) {
    const rel = path.relative(root, file);
    it(`${rel}: frontmatter parses and has name and description`, () => {
      const m = fs.readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      expect(m, `${rel}: no frontmatter`).not.toBeNull();
      // If it is broken, all fields come out empty at runtime (name and description alike)
      const fm = yaml.parse(m?.[1] ?? '') as Record<string, unknown>;
      expect(typeof fm.name, `${rel}: name`).toBe('string');
      expect(typeof fm.description, `${rel}: description`).toBe('string');
      // The listing has a budget. Put the key point first and keep it short
      expect(String(fm.description).length, `${rel}: description length`).toBeLessThanOrEqual(250);
    });
  }
});
