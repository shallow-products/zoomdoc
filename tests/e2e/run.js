#!/usr/bin/env node
/**
 * tests/e2e/run.js
 * Run scenarios N times with a real agent (Claude Code) and keep the records and a report.
 * Run it inside the container (zoomdoc-e2e). It is not run in CI.
 *
 *   node tests/e2e/run.js [scenario name ...] [--n 3] [--out /walkthrough/e2e] [--timeout 600]
 *
 * Omit the scenario names to run all of them. Output: <out>/<run id>/
 *   <scenario>-<i>/sandbox/        throwaway sample (outside the repository)
 *   <scenario>-<i>/transcript.jsonl full record of the conversation (stream-json, appended per turn)
 *   <scenario>-<i>/result.json      judgment and metrics
 *   report.md / summary.json        report
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMetrics, parseTranscript } from './metrics.js';
import { buildReport } from './report.js';
import { scenarios } from './scenarios.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const nOverride = opt('n');
const outBase = path.resolve(opt('out', '/walkthrough/e2e'));
const timeoutMs = Number(opt('timeout', '600')) * 1000;
const names = args.length ? args : Object.keys(scenarios);

const unknown = names.filter((n) => !scenarios[n]);
if (unknown.length) {
  console.error(
    `未知のシナリオ: ${unknown.join(', ')}（有る: ${Object.keys(scenarios).join(', ')}）`
  );
  process.exit(2);
}

// Where claude is unavailable, do not count it as passed; end as a failure
const probe = spawnSync('claude', ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  console.error(
    '❌ claude が使えません。zoomdoc-e2e コンテナで実行してください（スキップではなく失敗）。'
  );
  process.exit(2);
}

const git = (a) => spawnSync('git', ['-C', repoRoot, ...a], { encoding: 'utf8' }).stdout?.trim();
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(outBase, runId);
fs.mkdirSync(runDir, { recursive: true });
const meta = {
  runId,
  commit: process.env.ZOOMDOC_E2E_COMMIT || git(['rev-parse', '--short', 'HEAD']) || 'unknown',
  claudeVersion: probe.stdout.trim(),
  startedAt: new Date().toISOString()
};
console.log(`実行ID: ${runId}（commit ${meta.commit}, ${meta.claudeVersion}）`);

function runTurn({ prompt, cwd, sessionId, transcript }) {
  const cliArgs = [
    '-p',
    prompt,
    '--plugin-dir',
    repoRoot,
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-hook-events',
    '--dangerously-skip-permissions'
  ];
  if (sessionId) cliArgs.push('--resume', sessionId);
  const res = spawnSync('claude', cliArgs, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024
  });
  if (res.stdout)
    fs.appendFileSync(transcript, res.stdout.endsWith('\n') ? res.stdout : `${res.stdout}\n`);
  if (res.stderr) fs.appendFileSync(`${transcript}.stderr`, res.stderr);
  const events = parseTranscript(res.stdout ?? '');
  const result = events.findLast((e) => e.type === 'result');
  return {
    sessionId: result?.session_id ?? events.find((e) => e.session_id)?.session_id ?? sessionId,
    timedOut: res.error?.code === 'ETIMEDOUT',
    isError: !result || result.is_error === true
  };
}

const runs = [];
for (const name of names) {
  const sc = scenarios[name];
  const n = Number(nOverride ?? sc.repeat);
  for (let i = 1; i <= n; i++) {
    const dir = path.join(runDir, `${name}-${i}`);
    const sandbox = path.join(dir, 'sandbox');
    const transcript = path.join(dir, 'transcript.jsonl');
    fs.mkdirSync(dir, { recursive: true });
    spawnSync('node', [path.join(repoRoot, 'tests/walkthrough/setup.js'), sc.setup, sandbox], {
      stdio: 'ignore'
    });
    process.stdout.write(`▶ ${name} #${i}/${n} `);

    let sessionId;
    let aborted = null;
    for (const [t, prompt] of sc.turns.entries()) {
      const r = runTurn({ prompt, cwd: sandbox, sessionId, transcript });
      sessionId = r.sessionId;
      process.stdout.write(`t${t + 1}${r.isError ? '!' : ''} `);
      if (r.timedOut || !sessionId) {
        aborted = r.timedOut
          ? `ターン ${t + 1} がタイムアウト`
          : `ターン ${t + 1} でセッションが取れない`;
        break;
      }
    }

    // If the done marker is missing, nudge to continue (with an upper limit). The number of nudges is recorded
    let nudges = 0;
    while (
      !aborted &&
      sc.doneFile &&
      !fs.existsSync(path.join(sandbox, sc.doneFile)) &&
      nudges < (sc.maxNudges ?? 0)
    ) {
      nudges++;
      const r = runTurn({ prompt: sc.nudge, cwd: sandbox, sessionId, transcript });
      sessionId = r.sessionId;
      process.stdout.write(`n${nudges}${r.isError ? '!' : ''} `);
      if (r.timedOut || !sessionId) aborted = `促しのターン ${nudges} が失敗`;
    }

    const check = sc.check
      ? spawnSync('node', [path.join(repoRoot, 'tests/walkthrough/check.js'), sc.check, sandbox], {
          encoding: 'utf8'
        })
      : { status: 0, stdout: '' };
    const lines = check.stdout.split('\n');
    const failures = lines.filter((l) => l.startsWith('❌')).map((l) => l.replace(/^❌\s*/, ''));
    const warnings = lines.filter((l) => l.startsWith('⚠️')).map((l) => l.replace(/^⚠️\s*/, ''));
    const metrics = computeMetrics(
      fs.existsSync(transcript) ? parseTranscript(fs.readFileSync(transcript, 'utf8')) : []
    );
    const all = fs.existsSync(transcript)
      ? parseTranscript(fs.readFileSync(transcript, 'utf8'))
      : [];
    const answer = all.findLast((e) => e.type === 'result')?.result ?? '';
    for (const re of sc.expect ?? []) {
      if (!new RegExp(re).test(answer)) failures.push(`答えに /${re}/ が含まれない`);
    }
    const pass = !aborted && check.status === 0 && failures.length === 0;
    const rec = {
      scenario: name,
      index: i,
      pass,
      aborted,
      nudges,
      failures,
      warnings,
      metrics,
      sessionId
    };
    fs.writeFileSync(path.join(dir, 'result.json'), `${JSON.stringify(rec, null, 2)}\n`);
    runs.push(rec);
    console.log(pass ? '✅' : `❌ ${aborted ?? `${failures.length} 件`}`);
  }
}

fs.writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify({ meta, runs }, null, 2)}\n`);
fs.writeFileSync(path.join(runDir, 'report.md'), buildReport(meta, runs, scenarios));
console.log(`\nレポート: ${path.join(runDir, 'report.md')}`);
process.exit(runs.every((r) => r.pass) ? 0 : 1);
