/**
 * tests/e2e/metrics.js
 * Compute metrics from a Claude Code stream-json transcript.
 */
const SEARCH_CMD = /(^|[\s;&|(])(grep|rg|find)\s/;
// Suspected full scan: find starting at / ~ . .., or grep -r aimed at . or *. A find or ls with a narrowed scope is not counted
const BLANKET_CMD =
  /\bfind\s+(\/|~|\.|\.\.)(\s|$)|\b(grep|rg)\s[^|;]*-\w*r\w*[^|;]*\s(\.|\/|\*|~)(\s|$)/;
// Command that lists only the front matter title / description (the way the skill shows)
const FM_LIST_CMD = /(grep|awk|sed)\b[^\n]*\^?\(?title\|description\)?:?/;
const SCRIPT_CMD = /(node\s+(-e|--eval)\b|python3?\s+(-c\b|-\s*<<)|<<\s*['"]?\w+['"]?)/;
const SCRIPT_FILE = /\.(js|mjs|cjs|py|sh)$/;

export function parseTranscript(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function computeMetrics(events) {
  const m = {
    toolCalls: 0,
    tools: {},
    frontmatterListings: 0, // Number of times the title/description listing command was used
    blanketSearches: 0, // Unscoped full scans (a subset of searchCommands)
    searchCommands: 0, // grep / find / Grep / Glob (suspected full scans)
    handwrittenScripts: 0, // Running or creating hand-written scripts
    askUserQuestion: 0,
    initCli: 0,
    migrateCli: 0,
    hookEvents: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    durationMs: 0,
    errors: 0
  };
  for (const e of events) {
    if (e.type === 'system' && String(e.subtype ?? '').startsWith('hook')) m.hookEvents++;
    if (e.type === 'assistant') {
      for (const c of e.message?.content ?? []) {
        if (c.type !== 'tool_use') continue;
        m.toolCalls++;
        m.tools[c.name] = (m.tools[c.name] ?? 0) + 1;
        const input = c.input ?? {};
        if (c.name === 'AskUserQuestion') m.askUserQuestion++;
        if (c.name === 'Grep' || c.name === 'Glob') m.searchCommands++;
        if (c.name === 'Write' && SCRIPT_FILE.test(String(input.file_path ?? '')))
          m.handwrittenScripts++;
        if (c.name === 'Bash') {
          const cmd = String(input.command ?? '');
          if (SEARCH_CMD.test(cmd)) m.searchCommands++;
          if (BLANKET_CMD.test(cmd)) m.blanketSearches++;
          if (FM_LIST_CMD.test(cmd)) m.frontmatterListings++;
          if (SCRIPT_CMD.test(cmd)) m.handwrittenScripts++;
          if (/scripts\/init\.js/.test(cmd)) m.initCli++;
          if (/migrate\.js/.test(cmd)) m.migrateCli++;
        }
      }
    }
    if (e.type === 'result') {
      const u = e.usage ?? {};
      m.inputTokens += u.input_tokens ?? 0;
      m.outputTokens += u.output_tokens ?? 0;
      m.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      m.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
      m.costUsd += e.total_cost_usd ?? 0;
      m.durationMs += e.duration_ms ?? 0;
      if (e.is_error) m.errors++;
    }
  }
  return m;
}
