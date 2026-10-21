import fs from 'node:fs';
import path from 'node:path';
import type { MigrationAction } from './types.js';

export interface ReferenceChange {
  file: string; // File to rewrite (path before the run)
  line: number; // 1-based
  before: string;
  after: string;
}

export interface ReferenceRewriteEdit {
  file: string;
  content: string; // Full content after rewriting
  changes: ReferenceChange[];
}

export interface BrokenLink {
  file: string;
  line: number;
  target: string;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.zoomdoc', '.claude', '.cache']);
const CODE_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.java',
  '.kt',
  '.swift',
  '.dart',
  '.yml',
  '.yaml',
  '.toml',
  '.sh',
  '.txt'
]);
const MAX_BYTES = 1_000_000;

const LINK_RE = /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;
const REF_DEF_RE = /^(\s{0,3}\[[^\]]+\]:\s*)(\S+)/;
const FENCE_RE = /^\s*(```|~~~)/;

const toPosix = (p: string) => p.split(path.sep).join('/');

function normalize(p: string): string {
  return path.posix.normalize(toPosix(p)).replace(/^\.\//, '');
}

/** List the files to search for references (root-relative POSIX paths) */
function listScanFiles(rootDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if ((ext === '.md' || CODE_EXTS.has(ext)) && fs.statSync(full).size <= MAX_BYTES) {
          results.push(toPosix(path.relative(rootDir, full)));
        }
      }
    }
  };
  walk(rootDir);
  return results.sort();
}

interface TargetSpan {
  start: number;
  end: number;
}

/** Return the positions of Markdown link targets (inline and reference definitions) in a line */
function findTargetSpans(line: string): TargetSpan[] {
  const spans: TargetSpan[] = [];
  const def = line.match(REF_DEF_RE);
  if (def) {
    spans.push({ start: def[1].length, end: def[1].length + def[2].length });
  }
  for (const m of line.matchAll(LINK_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    spans.push({ start, end: start + m[2].length });
  }
  return spans.sort((a, b) => a.start - b.start);
}

function isExternalOrAbsolute(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/') || target.startsWith('#');
}

function splitTarget(target: string): { pathPart: string; fragment: string } {
  const i = target.indexOf('#');
  return i < 0
    ? { pathPart: target, fragment: '' }
    : { pathPart: target.slice(0, i), fragment: target.slice(i) };
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/**
 * From the move mapping, work out how references in the repository must be rewritten (no file is changed).
 * - Rewrite Markdown relative links (including anchors and reference definitions) to match the new positions
 * - Replace root-relative path strings such as `docs/...`, including those in Markdown and in code comments
 * - Out of scope: inside fenced code blocks (Markdown), external URLs, absolute paths, and links that do not exist and are not in the mapping
 * Calling it before or after the run gives the same result, and later calls produce no diff.
 */
export function planReferenceRewrites(
  rootDir: string,
  actions: Pick<MigrationAction, 'from' | 'to'>[]
): ReferenceRewriteEdit[] {
  const map = new Map<string, string>();
  for (const a of actions) {
    const from = normalize(a.from);
    const to = normalize(a.to);
    if (from !== to) map.set(from, to);
  }
  if (map.size === 0) return [];

  const known = (rel: string) => map.has(rel) || fs.existsSync(path.join(rootDir, rel));

  const alternatives = [...map.keys()]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const plainRe = new RegExp(`(?<![\\w./-])(?:${alternatives.join('|')})(?![\\w/-]|\\.\\w)`, 'g');
  const rewritePlain = (text: string) => text.replace(plainRe, (m) => map.get(m) ?? m);

  const edits: ReferenceRewriteEdit[] = [];

  for (const file of listScanFiles(rootDir)) {
    const isMarkdown = file.endsWith('.md');
    const oldDir = path.posix.dirname(file);
    const newDir = path.posix.dirname(map.get(file) ?? file);

    const rewriteLink = (target: string): string => {
      if (isExternalOrAbsolute(target) || target.includes('?')) return target;
      const { pathPart, fragment } = splitTarget(target);
      if (!pathPart) return target;

      const decoded = safeDecode(pathPart);
      const resolved = path.posix.join(oldDir, decoded);
      if (resolved.startsWith('..')) return target;
      const abs = path.posix.normalize(resolved);
      if (!known(abs)) return target;

      const moved = map.get(abs) ?? abs;
      if (moved === abs && newDir === oldDir) return target;

      let rel = path.posix.relative(newDir, moved);
      if (pathPart.startsWith('./') && !rel.startsWith('.')) rel = `./${rel}`;
      if (pathPart.endsWith('/') && !rel.endsWith('/')) rel += '/';
      if (decoded !== pathPart) rel = encodeURI(rel);
      return rel === pathPart ? target : rel + fragment;
    };

    const original = fs.readFileSync(path.join(rootDir, file), 'utf8');
    const lines = original.split('\n');
    const changes: ReferenceChange[] = [];
    let inFence = false;

    const out = lines.map((line, idx) => {
      if (isMarkdown && FENCE_RE.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;

      let result = '';
      let cursor = 0;
      for (const span of isMarkdown ? findTargetSpans(line) : []) {
        if (span.start < cursor) continue;
        result += rewritePlain(line.slice(cursor, span.start));
        result += rewriteLink(line.slice(span.start, span.end));
        cursor = span.end;
      }
      result += rewritePlain(line.slice(cursor));

      if (result !== line) {
        changes.push({ file, line: idx + 1, before: line.trim(), after: result.trim() });
      }
      return result;
    });

    if (changes.length > 0) {
      edits.push({ file, content: out.join('\n'), changes });
    }
  }

  return edits;
}

/** Detect internal links in Markdown whose target does not exist */
export function findBrokenLinks(rootDir: string): BrokenLink[] {
  const broken: BrokenLink[] = [];
  for (const file of listScanFiles(rootDir).filter((f) => f.endsWith('.md'))) {
    const dir = path.posix.dirname(file);
    let inFence = false;
    const lines = fs.readFileSync(path.join(rootDir, file), 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;
      for (const span of findTargetSpans(line)) {
        const target = line.slice(span.start, span.end);
        if (isExternalOrAbsolute(target) || target.includes('?')) continue;
        const { pathPart } = splitTarget(target);
        if (!pathPart) continue;
        const abs = path.posix.normalize(path.posix.join(dir, safeDecode(pathPart)));
        if (abs.startsWith('..') || !fs.existsSync(path.join(rootDir, abs))) {
          broken.push({ file, line: idx + 1, target });
        }
      }
    });
  }
  return broken;
}
