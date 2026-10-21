/**
 * scripts/structure_check.js
 * Dependency-free shared module that checks the consistency of where documents sit (it uses the same judgment as the hooks).
 * It writes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { scanSchemaFolders } from './docs_root.js';

const IGNORED_DIRS = new Set(['node_modules']);

function isIgnoredDir(name) {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

/** Recursively collect the .md files under a directory (hidden folders and node_modules are skipped) */
export function collectMarkdown(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!isIgnoredDir(e.name)) collectMarkdown(full, out);
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Return the folders directly under the root that are not in the schema, and the subdirectories under schema folders.
 *   unmanaged: { dir, files }[]  dir is project-relative, files are absolute paths
 *   nested: string[]            project-relative
 * By default folders without .md files are not counted (for the hooks). includeEmpty also counts empty folders (for the static check).
 */
export function findStructureIssues(
  projectRoot,
  docsRoot,
  folderKeys,
  { includeEmpty = false } = {}
) {
  const allowed = new Set(folderKeys);
  const unmanaged = [];
  const nested = [];
  const rootAbs = path.join(projectRoot, docsRoot);
  let entries = [];
  try {
    entries = fs.readdirSync(rootAbs, { withFileTypes: true });
  } catch {
    return { unmanaged, nested };
  }
  for (const e of entries) {
    if (!e.isDirectory() || isIgnoredDir(e.name)) continue;
    const rel = `${docsRoot}/${e.name}`;
    const abs = path.join(rootAbs, e.name);
    if (!allowed.has(rel)) {
      const files = collectMarkdown(abs);
      if (includeEmpty || files.length > 0) unmanaged.push({ dir: rel, files });
      continue;
    }
    for (const inner of fs.readdirSync(abs, { withFileTypes: true })) {
      if (inner.isDirectory() && !isIgnoredDir(inner.name)) nested.push(`${rel}/${inner.name}`);
    }
  }
  return { unmanaged, nested };
}

/** Return the sets of documents with the same title inside one folder. items: { path, folder, title }[] */
export function findDuplicateTitles(items) {
  const groups = new Map();
  for (const it of items) {
    const title = String(it.title ?? '').trim();
    if (!title) continue;
    const key = `${it.folder}\u0000${title}`;
    if (!groups.has(key)) groups.set(key, { folder: it.folder, title, paths: [] });
    groups.get(key).paths.push(it.path);
  }
  return [...groups.values()].filter((g) => g.paths.length > 1);
}

/** The templates (.zoomdoc/templates/*.md) referenced by the schema descriptions that do not exist */
export function findMissingTemplates(projectRoot, schemaText) {
  const missing = [];
  scanSchemaFolders(schemaText, {
    onLine: (line, folder) => {
      for (const m of line.matchAll(/\.zoomdoc\/templates\/[\w.-]+\.md/g)) {
        if (!fs.existsSync(path.join(projectRoot, m[0]))) {
          missing.push({ folder, template: m[0] });
        }
      }
    }
  });
  return missing;
}
