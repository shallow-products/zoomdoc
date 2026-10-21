#!/usr/bin/env node
/**
 * Measure how long the hooks take per number of documents (run it inside the container).
 *   docker compose run --rm zoomdoc-dev node tests/perf/hook_timing.js [--sizes 10,100,1000] [--runs 15]
 * What it measures: empty Node startup (fixed cost) / detect-issues / sync-triggers, with no change, with a change, and at SessionStart (--force)
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const sizes = arg('sizes', '10,100,1000').split(',').map(Number);
const runs = Number(arg('runs', '15'));

function makeProject(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zd-perf-'));
  const folders = ['decisions', 'guides', 'architecture', 'operations'];
  fs.mkdirSync(path.join(dir, '.zoomdoc'), { recursive: true });
  const schema = folders
    .map(
      (f) =>
        `  docs/${f}:\n    description: |\n      ${f} の文書。タイトルと説明を frontmatter に書く。`
    )
    .join('\n');
  fs.writeFileSync(
    path.join(dir, '.zoomdoc', 'schema.yaml'),
    `version: "2.0"\nfolders:\n${schema}\n`
  );
  for (let i = 0; i < n; i++) {
    const f = folders[i % folders.length];
    fs.mkdirSync(path.join(dir, 'docs', f), { recursive: true });
    const body = `---\ntitle: 文書${i}\ndescription: 文書${i}の説明\n---\n\n# 文書${i}\n\n${'本文です。[他](./doc-0.md) '.repeat(20)}\n`;
    fs.writeFileSync(path.join(dir, 'docs', f, `doc-${i}.md`), body);
  }
  return dir;
}

function time(cmd, args, cwd, env = {}) {
  const t = process.hrtime.bigint();
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  return { ms, out: r.stdout.length };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(xs.length * 0.95) - 1)];

function measure(label, fn) {
  fn(); // Warm-up
  const xs = Array.from({ length: runs }, () => fn());
  return { label, median: median(xs), p95: p95(xs) };
}

const hook = (name) => path.join(root, 'scripts', 'hooks', `${name}.js`);
const results = [];

const base = measure('node 空起動', () => time('node', ['-e', '0'], root).ms);
console.log(`${base.label}: median ${base.median.toFixed(0)}ms p95 ${base.p95.toFixed(0)}ms\n`);

for (const n of sizes) {
  const dir = makeProject(n);
  const rows = [];
  for (const name of ['detect-issues', 'sync-triggers', 'run']) {
    const env = { CLAUDE_PLUGIN_ROOT: root };
    // Build the state on the first run (later runs are "no change")
    time('node', [hook(name), '--env=claude', '--force'], dir, env);
    rows.push(
      measure(`${name} 変化なし`, () => time('node', [hook(name), '--env=claude'], dir, env).ms)
    );
    rows.push(
      measure(
        `${name} --force`,
        () => time('node', [hook(name), '--env=claude', '--force'], dir, env).ms
      )
    );
    rows.push(
      measure(`${name} 変化あり`, () => {
        const f = path.join(dir, 'docs', 'guides', 'doc-1.md');
        fs.appendFileSync(f, 'x');
        return time('node', [hook(name), '--env=claude'], dir, env).ms;
      })
    );
  }
  console.log(`## 文書 ${n} 件`);
  for (const r of rows)
    console.log(
      `${r.label.padEnd(28)} median ${r.median.toFixed(0).padStart(4)}ms  p95 ${r.p95.toFixed(0).padStart(4)}ms`
    );
  console.log();
  results.push({ n, rows });
  fs.rmSync(dir, { recursive: true, force: true });
}
fs.writeFileSync(
  path.join(os.tmpdir(), 'hook_timing.json'),
  JSON.stringify({ base, results }, null, 2)
);
