/**
 * scripts/hooks/hook-state.js
 * The shared "stay quiet" mechanism of the hooks (no dependencies).
 * - Disabling: hooks.<name> is false in .zoomdoc/config.json, or the environment variable ZOOMDOC_DISABLE_HOOKS
 * - Change detection: if the signature of the target files (count, mtime, size) equals the last one, neither rescan nor re-notify
 * - Suppressing duplicates: a notice identical to the last one is not shown (only --force at session start always shows)
 * - Re-notification: a finding that is still unfixed is shown again after a set number of silent prompts (default 10)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE_REL = path.join('.zoomdoc', '.cache', 'hook-state.json');

export function isHookDisabled(root, name) {
  const env = (process.env.ZOOMDOC_DISABLE_HOOKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (env.includes('all') || env.includes(name)) return true;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.zoomdoc', 'config.json'), 'utf8'));
    return cfg?.hooks?.[name] === false;
  } catch {
    return false;
  }
}

const DEFAULT_RENOTIFY_EVERY = 10;

/** Interval (in prompts) for re-notifying a finding that is still unfixed. hooks.renotifyEvery in .zoomdoc/config.json; 0 means never */
export function renotifyEvery(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.zoomdoc', 'config.json'), 'utf8'));
    const n = cfg?.hooks?.renotifyEvery;
    return Number.isInteger(n) && n >= 0 ? n : DEFAULT_RENOTIFY_EVERY;
  } catch {
    return DEFAULT_RENOTIFY_EVERY;
  }
}

/**
 * Count one more silent prompt and return whether the re-notification interval has been reached.
 * prev is the state saved last time (if the digest is empty, meaning no findings, nothing is counted and nothing is re-notified).
 */
export function nextQuiet(root, prev) {
  if (!prev.digest) return { renotify: false, quiet: 0 };
  const every = renotifyEvery(root);
  const quiet = (prev.quiet || 0) + 1;
  if (every > 0 && quiet >= every) return { renotify: true, quiet: 0 };
  return { renotify: false, quiet };
}

function readState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_REL), 'utf8'));
  } catch {
    return {};
  }
}

export function loadHookState(root, name) {
  return readState(root)[name] || {};
}

export function saveHookState(root, name, value) {
  try {
    const state = readState(root);
    state[name] = value;
    const file = path.join(root, STATE_REL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state), 'utf8');
  } catch {
    // If the state cannot be saved, there are only more notices; behavior does not change
  }
}

/** Signature of a set of target files. Computed from stat alone without reading content (light even for many files) */
export function treeSignature(extraKeys, files) {
  let maxMtime = 0;
  let totalSize = 0;
  for (const f of files) {
    try {
      const st = fs.statSync(f);
      if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
      totalSize += st.size;
    } catch {
      // A vanished file shows up as a change in count
    }
  }
  return [...extraKeys, files.length, maxMtime, totalSize].join(':');
}

/** Find the root of the project containing schema.yaml by walking from cwd to its parents (cwd if none) */
export function findProjectRoot(start = process.cwd()) {
  let curr = path.resolve(start);
  const root = path.parse(curr).root;
  while (curr !== root) {
    if (fs.existsSync(path.join(curr, '.zoomdoc', 'schema.yaml'))) return curr;
    curr = path.dirname(curr);
  }
  return process.cwd();
}

/** Extract --name=value from the arguments */
export function argValue(argv, name) {
  return argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

/**
 * CLI output: stdout for Claude Code, an ephemeralMessage in injectSteps for Antigravity.
 * messages is an array of { text, pad }. pad asks Claude Code to put newlines around it.
 */
export function formatOutput(messages, isAGY) {
  const list = messages.filter((m) => m?.text);
  if (list.length === 0) return '';
  if (isAGY) {
    return JSON.stringify({ injectSteps: list.map((m) => ({ ephemeralMessage: m.text })) });
  }
  return list.map((m) => (m.pad ? `\n${m.text}\n` : m.text)).join('\n');
}

/** Whether this file was run directly as a CLI */
export function isMain(metaUrl) {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

/**
 * Whether this is Antigravity's first invocation (invocationNum is 1). Reads JSON from stdin (it can be read only once).
 * In Claude Code, SessionStart passes --force, so this check is not used.
 */
export function isFirstAgyInvocation() {
  try {
    const buf = fs.readFileSync(process.stdin.fd, 'utf8');
    if (!buf || !buf.trim()) return false;
    const data = JSON.parse(buf);
    return data?.invocationNum === 1 || data?.invocationNum === '1';
  } catch {
    return false;
  }
}
