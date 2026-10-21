/**
 * scripts/link_check.js
 * Internal link check for Markdown (no dependencies). zoomdoc:lint and the hook (detect-issues) use the same judgment.
 */
import fs from 'node:fs';
import path from 'node:path';

const FENCE_RE = /^\s*(```|~~~)/;

/** Replace fenced code blocks and inline code with spaces (line numbers are kept) */
function maskCode(content) {
  let inFence = false;
  return content
    .split('\n')
    .map((line) => {
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        return ' '.repeat(line.length);
      }
      if (inFence) return ' '.repeat(line.length);
      return line.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
    })
    .join('\n');
}

/** GitHub-compatible heading slug (lowercase, strip symbols, spaces to hyphens) */
export function githubSlug(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The set of anchors a document can jump to (heading slugs, duplicates as -1 -2, HTML id/name) */
export function collectAnchors(content) {
  const anchors = new Set();
  const seen = new Map();
  let inFence = false;
  for (const line of content.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) {
      const slug = githubSlug(m[1]);
      const n = seen.get(slug) ?? 0;
      seen.set(slug, n + 1);
      anchors.add(n === 0 ? slug : `${slug}-${n}`);
    }
    for (const h of line.matchAll(/<a\s[^>]*?(?:id|name)=["']([^"']+)["']/gi)) {
      anchors.add(h[1].toLowerCase());
    }
  }
  return anchors;
}

const LINK_RE = /!?\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^)]*["'])?\s*\)/g;
const REF_DEF_RE = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/;

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Verify internal links in Markdown. Besides file existence, also check that `#anchor` exists among the target document's headings.
 * Code blocks and external URLs are out of scope.
 */
export function checkMarkdownLinks(projectRoot, filePath, content) {
  const issues = [];
  const anchorCache = new Map();
  const anchorsOf = (file, text) => {
    let set = anchorCache.get(file);
    if (!set) {
      set = collectAnchors(text ?? fs.readFileSync(file, 'utf8'));
      anchorCache.set(file, set);
    }
    return set;
  };

  const lines = maskCode(content).split('\n');
  lines.forEach((line, idx) => {
    const found = [];
    const def = line.match(REF_DEF_RE);
    if (def) found.push({ label: def[1], raw: def[2] });
    for (const m of line.matchAll(LINK_RE)) found.push({ label: m[1], raw: m[2] });

    for (const { label, raw } of found) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;

      const hashIdx = raw.indexOf('#');
      const pathPart = (hashIdx < 0 ? raw : raw.slice(0, hashIdx)).split('?')[0];
      const fragment = hashIdx < 0 ? '' : safeDecode(raw.slice(hashIdx + 1)).toLowerCase();

      let targetFile = filePath;
      if (pathPart) {
        const decoded = safeDecode(pathPart);
        let resolved = path.resolve(path.dirname(filePath), decoded);
        if (!fs.existsSync(resolved)) {
          const rootRelative = path.resolve(projectRoot, decoded.replace(/^\//, ''));
          if (fs.existsSync(rootRelative)) resolved = rootRelative;
          else {
            issues.push({ kind: 'file', line: idx + 1, label, target: raw });
            continue;
          }
        }
        targetFile = resolved;
      }

      if (!fragment) continue;
      if (!targetFile.endsWith('.md') || !fs.existsSync(targetFile)) continue;
      const text = targetFile === filePath ? content : undefined;
      if (!anchorsOf(targetFile, text).has(fragment)) {
        issues.push({ kind: 'anchor', line: idx + 1, label, target: raw });
      }
    }
  });
  return issues;
}
