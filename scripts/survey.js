/**
 * scripts/survey.js
 * Read-only survey of a project before zoomdoc is deployed (used by /zoomdoc:init).
 * Reports the git state, an existing schema, monorepo signals and where the documents are. Writes nothing.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderTree } from './layout.js';

const DOC_EXT = new Set(['.md', '.mdx', '.rst', '.adoc']);

/** Directories that hold generated, vendored or tool-owned files, never user-designed documents */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'target',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  '.zoomdoc',
  '.claude',
  '.github'
]);

/** Files every repository has at its root; they are listed apart from the project's own documents */
const ROOT_FILES =
  /^(readme|changelog|license|contributing|code_of_conduct|security|agents|claude)(\.|$)/i;

const MONOREPO_SIGNALS = ['pnpm-workspace.yaml', 'lerna.json', 'nx.json', 'turbo.json'];

function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    return null;
  }
}

function gitState(root) {
  if (git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() !== 'true') {
    return { isRepo: false, branch: null, dirty: 0 };
  }
  const status = git(root, ['status', '--porcelain']) ?? '';
  return {
    isRepo: true,
    branch: git(root, ['branch', '--show-current'])?.trim() || null,
    dirty: status.split('\n').filter(Boolean).length
  };
}

function detectMonorepo(root) {
  const signals = MONOREPO_SIGNALS.filter((f) => fs.existsSync(path.join(root, f)));
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.workspaces) signals.push('package.json workspaces');
  } catch {
    // no package.json, or not readable: no signal
  }
  return signals;
}

/** Walk the project and collect document files. Returns { docs: [relative paths], rootFiles, excluded } */
function collectDocs(root) {
  const docs = [];
  const rootFiles = [];
  const excluded = new Set();
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) {
          if (ent.name !== '.git') excluded.add(rel);
        } else {
          walk(full);
        }
      } else if (ent.isFile() && DOC_EXT.has(path.extname(ent.name).toLowerCase())) {
        if (dir === root && ROOT_FILES.test(ent.name)) rootFiles.push(rel);
        else docs.push(rel);
      }
    }
  };
  walk(root);
  return { docs: docs.sort(), rootFiles: rootFiles.sort(), excluded: [...excluded].sort() };
}

/** Group documents by their folder, shortened to at most two levels */
function groupFolders(docs) {
  const counts = new Map();
  for (const doc of docs) {
    const dir = path.posix.dirname(doc);
    const key = dir === '.' ? '(project root)' : dir.split('/').slice(0, 2).join('/');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

export function surveyProject(root) {
  const { docs, rootFiles, excluded } = collectDocs(root);
  return {
    root,
    git: gitState(root),
    hasSchema: fs.existsSync(path.join(root, '.zoomdoc', 'schema.yaml')),
    monorepoSignals: detectMonorepo(root),
    totalDocs: docs.length,
    folders: groupFolders(docs),
    rootFiles,
    excluded
  };
}

export function renderSurvey(s) {
  const lines = [`Project: ${s.root}`, ''];
  lines.push('Preflight');
  lines.push(
    s.git.isRepo
      ? `  git: branch ${s.git.branch ?? '(detached)'}, ${s.git.dirty === 0 ? 'working tree clean' : `${s.git.dirty} uncommitted change(s)`}`
      : '  git: not a repository'
  );
  lines.push(
    `  zoomdoc schema: ${s.hasSchema ? 'already present (.zoomdoc/schema.yaml)' : 'none'}`
  );
  lines.push(
    `  monorepo: ${s.monorepoSignals.length > 0 ? s.monorepoSignals.join(', ') : 'no signals'}`
  );
  lines.push('', `Documents found: ${s.totalDocs}`);
  const real = s.folders.filter((f) => f.folder !== '(project root)');
  if (real.length > 0) {
    lines.push(renderTree(real.map((f) => ({ path: f.folder, note: `${f.count} file(s)` }))));
  }
  const loose = s.folders.find((f) => f.folder === '(project root)');
  if (loose) lines.push(`  Outside any folder: ${loose.count} file(s)`);
  if (s.totalDocs === 0) lines.push('  (none: this is a fresh start)');
  if (s.rootFiles.length > 0)
    lines.push('', `Standard project files (not counted): ${s.rootFiles.join(', ')}`);
  if (s.excluded.length > 0)
    lines.push(`Skipped as generated or tool-owned: ${s.excluded.join(', ')}`);
  return lines.join('\n');
}
