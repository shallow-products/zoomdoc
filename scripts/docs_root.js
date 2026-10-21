/**
 * scripts/docs_root.js
 * Dependency-free shared module that derives the documentation root folder (default docs) from the folder names in .zoomdoc/schema.yaml.
 * There is no config file. The schema is the only source of truth, and the root is the common parent directory of its folders keys.
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_DOCS_ROOT = 'docs';

/** Normalize input to a project-relative POSIX path. Empty values, absolute paths and anything containing `..` are rejected */
export function normalizeDocsRoot(input) {
  const cleaned = String(input ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/\/+$/, '');
  if (
    !cleaned ||
    cleaned === '.' ||
    cleaned.startsWith('/') ||
    /^[a-z]:/i.test(cleaned) ||
    cleaned.split('/').some((seg) => seg === '..' || seg === '')
  ) {
    throw new Error(`docsRoot must be a relative folder inside the project (got "${input}")`);
  }
  return cleaned;
}

/** If the line is a key directly under `folders:` (two-space indent, `path:`), return the path. Any other line gives null */
export function matchFolderKey(line) {
  const m = line.match(/^ {2}["']?([^\s"':#][^"':]*?)["']?:\s*$/);
  return m ? m[1] : null;
}

/**
 * Scan the lines under `folders` in the schema.yaml text in order (a light version without dependencies).
 * onFolder(path) is called for each folder key line, and onLine(line, currentPath) for every other line.
 */
export function scanSchemaFolders(yamlText, { onFolder, onLine }) {
  let inFolders = false;
  let current = null;
  for (const line of yamlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^folders:\s*$/.test(trimmed)) {
      inFolders = true;
      continue;
    }
    if (!inFolders) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) break;
    const key = matchFolderKey(line);
    if (key) {
      current = key;
      onFolder?.(key);
    } else if (current) {
      onLine?.(line, current);
    }
  }
}

/** Extract the keys directly under folders (the folder paths) from the schema.yaml text */
export function parseSchemaFolderKeys(yamlText) {
  const keys = [];
  scanSchemaFolders(yamlText, { onFolder: (k) => keys.push(k) });
  return keys;
}

/**
 * Derive the documentation root from a set of folder paths.
 * The leading part shared by the parent directories of every path (`docs/a`, `docs/b` → `docs`). null if nothing is shared.
 */
export function deriveDocsRoot(folderKeys) {
  const parents = folderKeys.map((k) => k.split('/').slice(0, -1));
  if (parents.length === 0) return null;
  let common = parents[0];
  for (const segs of parents.slice(1)) {
    let i = 0;
    while (i < common.length && i < segs.length && common[i] === segs[i]) i++;
    common = common.slice(0, i);
  }
  return common.length > 0 ? common.join('/') : null;
}

/** The list of leading directories when no single root can be decided (folders are scattered). Empty if there is no problem */
export function findMultipleRoots(folderKeys) {
  if (folderKeys.length === 0 || deriveDocsRoot(folderKeys)) return [];
  return [...new Set(folderKeys.map((k) => (k.includes('/') ? k.split('/')[0] : '(top level)')))];
}

/** The root derived from schema.yaml. The default docs when there is no schema, it cannot be read, or no root can be decided */
export function getDocsRoot(projectRoot) {
  try {
    const text = fs.readFileSync(path.join(projectRoot, '.zoomdoc', 'schema.yaml'), 'utf8');
    return deriveDocsRoot(parseSchemaFolderKeys(text)) ?? DEFAULT_DOCS_ROOT;
  } catch {
    return DEFAULT_DOCS_ROOT;
  }
}

/** Re-point only the folders keys (`  docs/…:`) of the standard schema.yaml to docsRoot */
export function rebaseSchemaText(text, docsRoot) {
  if (docsRoot === DEFAULT_DOCS_ROOT) return text;
  return text.replace(
    /^( {2})docs(\/[^\n:]*)?:/gm,
    (_m, indent, rest = '') => `${indent}${docsRoot}${rest}:`
  );
}
