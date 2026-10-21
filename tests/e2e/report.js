/**
 * tests/e2e/report.js
 * Build a per-scenario report (Markdown) from the run results.
 * It also prints a row that can be pasted into benchmark.md (earlier rows are not rewritten; rows are added).
 */
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f = (x, d = 1) => x.toFixed(d);

export function summarize(runs) {
  const total = (k) => runs.map((r) => r.metrics[k]);
  return {
    n: runs.length,
    passed: runs.filter((r) => r.pass).length,
    toolCalls: avg(total('toolCalls')),
    searchCommands: avg(total('searchCommands')),
    blanketSearches: avg(total('blanketSearches')),
    frontmatterListings: avg(total('frontmatterListings')),
    reads: avg(runs.map((r) => r.metrics.tools.Read ?? 0)),
    handwrittenScripts: avg(total('handwrittenScripts')),
    askUserQuestion: avg(total('askUserQuestion')),
    migrateCli: avg(total('migrateCli')),
    initCli: avg(total('initCli')),
    outputTokens: avg(total('outputTokens')),
    newInputTokens: avg(runs.map((r) => r.metrics.inputTokens + r.metrics.cacheCreationTokens)),
    costUsd: avg(total('costUsd')),
    durationSec: avg(total('durationMs')) / 1000
  };
}

export function buildReport(meta, runs, scenarios) {
  const names = [...new Set(runs.map((r) => r.scenario))];
  const out = [];
  out.push(`# 自動E2E レポート ${meta.runId}`, '');
  out.push(`- commit: \`${meta.commit}\` / ${meta.claudeVersion}`, '');
  out.push('## 合格率と指標（1実行あたりの平均）', '');
  out.push(
    '| シナリオ | 合格 | 促し | ツール呼び出し | Read | 一覧コマンド | grep/find | うち全走査 | 手書きスクリプト | init.js | migrate.js | 出力トークン | 新規入力トークン | 費用($) | 所要(秒) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  );
  const rows = [];
  for (const name of names) {
    const rs = runs.filter((r) => r.scenario === name);
    const s = summarize(rs);
    out.push(
      `| ${name} | ${s.passed}/${s.n} | ${rs.reduce((a, r) => a + (r.nudges ?? 0), 0)} | ${f(s.toolCalls)} | ${f(s.reads)} | ${f(s.frontmatterListings)} | ${f(s.searchCommands)} | ${f(s.blanketSearches)} | ${f(s.handwrittenScripts)} | ${f(s.initCli)} | ${f(s.migrateCli)} | ${Math.round(s.outputTokens)} | ${Math.round(s.newInputTokens)} | ${f(s.costUsd, 2)} | ${Math.round(s.durationSec)} |`
    );
    rows.push(
      `| ${meta.runId.slice(0, 10)} | \`${meta.commit}\` | ${name} | ${s.passed}/${s.n} (${Math.round((100 * s.passed) / s.n)}%) | grep/find ${f(s.searchCommands)}、手書き ${f(s.handwrittenScripts)}、${Math.round(s.outputTokens)} 出力トークン |`
    );
  }
  out.push('', '## 失敗した判定', '');
  const failed = runs.filter((r) => !r.pass);
  if (!failed.length) out.push('なし。');
  for (const r of failed) {
    out.push(`### ${r.scenario} #${r.index}${r.aborted ? `（${r.aborted}）` : ''}`, '');
    for (const m of r.failures) out.push(`- ${m}`);
    if (!r.failures.length && !r.aborted) out.push('- （判定の詳細なし。記録を確認）');
    out.push('');
  }
  const warns = [...new Set(runs.flatMap((r) => r.warnings))];
  if (warns.length) {
    out.push('## 目視が必要な警告', '', ...warns.map((w) => `- ${w}`), '');
  }
  out.push('## benchmark.md に足す行', '');
  out.push(
    '| 測定日 | commit | シナリオ | 合格率 | 主な指標 |',
    '|---|---|---|---|---|',
    ...rows,
    ''
  );
  out.push('記録（会話の全記録）は、各 `<シナリオ>-<i>/transcript.jsonl`。');
  return `${out.join('\n')}\n`;
}
