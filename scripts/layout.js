/**
 * scripts/layout.js
 * Dependency-free helpers that show a folder layout as a directory tree (used by /zoomdoc:init).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rebaseSchemaText, scanSchemaFolders } from './docs_root.js';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Render [{ path, note? }] as a directory tree with the notes aligned in one column.
 * A single top-level folder (`docs/`) is shown as the first line, without a connector.
 */
export function renderTree(entries) {
  const root = { children: new Map() };
  for (const entry of entries) {
    let node = root;
    for (const seg of entry.path.split('/')) {
      if (!node.children.has(seg)) node.children.set(seg, { children: new Map() });
      node = node.children.get(seg);
    }
    node.note = entry.note;
  }

  const rows = [];
  const walk = (node, prefix) => {
    const names = [...node.children.keys()];
    names.forEach((name, i) => {
      const child = node.children.get(name);
      const last = i === names.length - 1;
      rows.push({ label: `${prefix}${last ? '└── ' : '├── '}${name}/`, note: child.note });
      walk(child, prefix + (last ? '    ' : '│   '));
    });
  };

  if (root.children.size === 1) {
    const [name, child] = [...root.children][0];
    rows.push({ label: `${name}/`, note: child.note });
    walk(child, '');
  } else {
    walk(root, '');
  }

  const width = Math.max(0, ...rows.map((r) => r.label.length)) + 2;
  return rows.map((r) => (r.note ? `${r.label.padEnd(width)}${r.note}` : r.label)).join('\n');
}

/** The folders of a schema text, each with its one-line description */
export function parseSchemaLayout(yamlText) {
  const layout = [];
  scanSchemaFolders(yamlText, {
    onFolder: (p) => layout.push({ path: p, note: '' }),
    onLine: (line) => {
      const m = line.match(/^ {4}description:\s*(.*)$/);
      const last = layout[layout.length - 1];
      if (m && last && !last.note) last.note = m[1].replace(/^["']|["']$/g, '');
    }
  });
  return layout;
}

/** The recommended layout: the bundled standard schema, re-pointed to docsRoot */
export function recommendedLayout(docsRoot) {
  const text = fs.readFileSync(path.join(pluginRoot, '.zoomdoc', 'schema.yaml'), 'utf8');
  return parseSchemaLayout(rebaseSchemaText(text, docsRoot));
}
