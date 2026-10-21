#!/usr/bin/env node
/**
 * scripts/scan_experiment.js
 * Scan strategy comparison experiment. `prepare` builds a classification prompt per strategy,
 * and `score` grades the model's answers (responses/<name>.json) into a table.
 *
 *   node scripts/scan_experiment.js prepare --out <dir>
 *   (give each <dir>/prompts/<name>.md to the model and save the JSON as <dir>/responses/<name>.json)
 *   node scripts/scan_experiment.js score --out <dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { NAMED_STRATEGIES } from '../src/migration/extractors.ts';
import {
  buildClassificationPrompt,
  buildFormatCorpus,
  buildMarkdownCorpus,
  scoreResponses
} from '../src/migration/experiment.ts';

const [cmd, ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf('--out');
if (!cmd || outIdx < 0 || !rest[outIdx + 1]) {
  console.error('usage: scan_experiment.js <prepare|score> --out <dir>');
  process.exit(1);
}
const out = path.resolve(rest[outIdx + 1]);
const repoRoot = path.resolve(import.meta.dirname, '..');

const mdCorpus = buildMarkdownCorpus(repoRoot);
const fmtCorpus = buildFormatCorpus(path.join(repoRoot, 'tests/fixtures/scan-formats'));

const experiments = [
  ...Object.keys(NAMED_STRATEGIES).map((name) => ({
    name: `md-${name}`,
    corpus: mdCorpus,
    strategy: NAMED_STRATEGIES[name],
    options: {}
  })),
  {
    name: 'fmt-generic',
    corpus: fmtCorpus,
    strategy: NAMED_STRATEGIES['head30-tail10'],
    options: { formatAware: false }
  },
  {
    name: 'fmt-aware',
    corpus: fmtCorpus,
    strategy: NAMED_STRATEGIES['head30-tail10'],
    options: { formatAware: true }
  }
];

if (cmd === 'prepare') {
  fs.mkdirSync(path.join(out, 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(out, 'responses'), { recursive: true });
  const meta = {};
  for (const e of experiments) {
    const p = buildClassificationPrompt(e.corpus, e.strategy, e.options);
    fs.writeFileSync(path.join(out, 'prompts', `${e.name}.md`), p.prompt);
    meta[e.name] = { docs: e.corpus.length, perDocTokens: p.perDocTokens, totalTokens: p.totalTokens };
  }
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`prepared ${experiments.length} prompts in ${out}`);
  console.log(`markdown corpus: ${mdCorpus.length} docs, format corpus: ${fmtCorpus.length} docs`);
} else if (cmd === 'score') {
  const meta = JSON.parse(fs.readFileSync(path.join(out, 'meta.json'), 'utf8'));
  const rows = ['| 実験 | 件数 | トークン/件(概算) | 正解率 | 罠(末尾廃止注記) | 誤り |', '|:---|---:|---:|---:|:---:|:---|'];
  for (const e of experiments) {
    const file = path.join(out, 'responses', `${e.name}.json`);
    if (!fs.existsSync(file)) {
      rows.push(`| ${e.name} | - | - | (未実施) | - | - |`);
      continue;
    }
    const res = scoreResponses(e.corpus, JSON.parse(fs.readFileSync(file, 'utf8')));
    const trap = res.trapTotal ? `${res.trapCorrect}/${res.trapTotal}` : '-';
    const miss = res.misses.map((m) => `${m.expected}→${m.predicted}${m.note ? '(罠)' : ''}`).join(', ');
    rows.push(
      `| ${e.name} | ${res.total} | ${meta[e.name].perDocTokens} | ${(res.accuracy * 100).toFixed(1)}% (${res.correct}/${res.total}) | ${trap} | ${miss} |`
    );
  }
  console.log(rows.join('\n'));
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
