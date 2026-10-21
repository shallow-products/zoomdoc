#!/usr/bin/env node
/**
 * tests/e2e/summarize.js
 * Recompute the metrics from saved runs (transcript.jsonl and result.json) and print a report.
 * Use it to recount past runs without rerunning them after the definition of a metric changes.
 *   node tests/e2e/summarize.js <run directory>...
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeMetrics, parseTranscript } from './metrics.js';
import { buildReport } from './report.js';
import { scenarios } from './scenarios.js';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('usage: node tests/e2e/summarize.js <run dir>...');
  process.exit(1);
}
const runs = [];
for (const dir of dirs) {
  for (const sub of fs.readdirSync(dir)) {
    const resultFile = path.join(dir, sub, 'result.json');
    const transcript = path.join(dir, sub, 'transcript.jsonl');
    if (!fs.existsSync(resultFile) || !fs.existsSync(transcript)) continue;
    const rec = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    rec.metrics = computeMetrics(parseTranscript(fs.readFileSync(transcript, 'utf8')));
    runs.push(rec);
  }
}
const meta = { runId: 'resummarized', commit: '-', claudeVersion: '-' };
process.stdout.write(buildReport(meta, runs, scenarios));
