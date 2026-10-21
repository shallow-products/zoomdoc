import fs from 'node:fs';
import path from 'node:path';

export interface FileScanTarget {
  relPath: string; // e.g. "docs/setup.md"
  fullPath: string;
}

export interface FileHeadTail {
  relPath: string;
  head: string;
  tail: string;
}

export interface ExtractedDocMeta {
  path: string;
  title: string;
  summary: string;
}

/**
 * Recursively collect every Markdown file (.md) under the target directory and return them sorted by path
 */
export function listMarkdownFiles(rootDir: string, docsRelDir = 'docs'): FileScanTarget[] {
  const targetBase = path.resolve(rootDir, docsRelDir);
  if (!fs.existsSync(targetBase)) {
    return [];
  }

  const results: FileScanTarget[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relPath = path.relative(rootDir, fullPath);
        results.push({ relPath, fullPath });
      }
    }
  }

  walk(targetBase);
  // Sort alphabetically (files of the same level line up naturally)
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** Extensions to take in (including non-Markdown text and spec files) */
export const SCANNABLE_EXTENSIONS = ['.md', '.txt', '.adoc', '.rst', '.yaml', '.yml', '.json'];

/**
 * Recursively collect files with the given extensions under the target directory (in path order).
 * Pass extensions to include non-Markdown files.
 */
export function listScannableFiles(
  rootDir: string,
  docsRelDir = 'docs',
  extensions: string[] = ['.md']
): FileScanTarget[] {
  const targetBase = path.resolve(rootDir, docsRelDir);
  if (!fs.existsSync(targetBase)) return [];
  const exts = new Set(extensions.map((e) => (e.startsWith('.') ? e : `.${e}`).toLowerCase()));
  const results: FileScanTarget[] = [];

  function walk(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(fullPath);
      } else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
        results.push({ relPath: path.relative(rootDir, fullPath), fullPath });
      }
    }
  }

  walk(targetBase);
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * Slice the file list evenly into the given number of chunks (or subagents)
 */
export function chunkFiles<T>(items: T[], chunkCount: number): T[][] {
  if (chunkCount <= 0 || items.length === 0) return items.length ? [items] : [];
  const actualChunks = Math.min(chunkCount, items.length);
  const chunks: T[][] = Array.from({ length: actualChunks }, () => []);

  items.forEach((item, index) => {
    chunks[index % actualChunks].push(item);
  });

  return chunks;
}

/**
 * Cheaply extract only the head (headLines lines) and tail (tailLines lines) of a file
 */
export function readHeadAndTail(
  fullPath: string,
  headLines = 30,
  tailLines = 10
): { head: string; tail: string } {
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split(/\r?\n/);

  if (lines.length <= headLines + tailLines) {
    return {
      head: content,
      tail: ''
    };
  }

  const head = lines.slice(0, headLines).join('\n');
  const tail = lines.slice(-tailLines).join('\n');
  return { head, tail };
}

/**
 * Safety diagnosis based on the file count (an objective assessment of heavy token use and large-scale risk)
 */
export function evaluateScanSafety(fileCount: number): import('./types.js').ScanSafetyAssessment {
  if (fileCount <= 30) {
    return {
      fileCount,
      severity: 'normal',
      recommendedSubagents: Math.min(3, Math.max(1, Math.ceil(fileCount / 10))),
      isLargeScale: false,
      message: `There are ${fileCount} target documents. Automatic scanning and migration can run safely as usual.`
    };
  }

  if (fileCount <= 80) {
    const agents = Math.min(5, Math.ceil(fileCount / 10));
    return {
      fileCount,
      severity: 'caution',
      recommendedSubagents: agents,
      isLargeScale: true,
      message: `There are ${fileCount} target documents. About ${agents} subagents will be used and a substantial number of tokens consumed. Continue with the automatic migration? (Otherwise choose a manual migration.)`
    };
  }

  return {
    fileCount,
    severity: 'warning',
    recommendedSubagents: 5,
    isLargeScale: true,
    message: `There are ${fileCount} target documents, which is large. Migrating them all automatically at once consumes a lot of tokens and makes the change very large. Choose between forcing the automatic migration and arranging them by hand in stages.`
  };
}
