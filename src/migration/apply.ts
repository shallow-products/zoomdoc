import fs from 'node:fs';
import path from 'node:path';
import { findBrokenLinks, planReferenceRewrites } from './rewrite_refs.js';
import type {
  DirectoryResponsibility,
  MigrationAction,
  MigrationExecutionLog,
  MigrationPlanProposal,
  MigrationPlanType
} from './types.js';

export type MigrationFileAction = MigrationAction;
export type MigrationPlan = {
  planType: MigrationPlanType;
  actions: MigrationAction[];
  directoryResponsibilities?: DirectoryResponsibility[];
};
export type MigrationLog = MigrationExecutionLog;

/**
 * Resolve a path relative to the root. Throw if the result is not inside the root
 * (so that a plan or log containing `../` cannot touch files outside the root)
 */
export function resolveInsideRoot(rootDir: string, rel: string): string {
  const base = path.resolve(rootDir);
  const resolved = path.resolve(base, rel);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path escapes the project root: ${rel}`);
  }
  return resolved;
}

/**
 * Remove any existing YAML front matter from the Markdown and return only the body
 */
export function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('\n---', 3);
    if (endIdx !== -1) {
      // Take everything after the newline following the closing ---
      const after = content.slice(endIdx + 4);
      return after.replace(/^\r?\n/, '');
    }
  }
  return content;
}

/**
 * Prepend the required front matter (title / description). No dates are written; they come from git
 */
export function formatFrontmatter(meta: { title: string; description: string }): string {
  // Escape double quotes (and keep values on one line)
  const safeTitle = meta.title.replace(/"/g, '\\"');
  const safeDesc = meta.description.replace(/"/g, '\\"');

  return `---
title: "${safeTitle}"
description: "${safeDesc}"
---
`;
}

/**
 * Run a migration plan (apply)
 */
export function applyMigrationPlan(
  rootDir: string,
  plan: MigrationPlan,
  options: { dryRun?: boolean } = {}
): MigrationLog {
  const dryRun = options.dryRun ?? false;
  const changes: MigrationLog['changes'] = [];

  // Before touching any file, check that every path is inside the root
  for (const action of plan.actions) {
    resolveInsideRoot(rootDir, action.from);
    resolveInsideRoot(rootDir, action.to);
  }

  // Work out the reference rewrites (links, path strings) caused by the moves before touching files
  const edits = planReferenceRewrites(rootDir, plan.actions);
  const editByFile = new Map(edits.map((e) => [e.file, e]));
  const movedFrom = new Set<string>();

  // 1. Run each file's action
  for (const action of plan.actions) {
    const fromPath = resolveInsideRoot(rootDir, action.from);
    const toPath = resolveInsideRoot(rootDir, action.to);

    if (!fs.existsSync(fromPath)) {
      throw new Error(`Source file not found: ${action.from}`);
    }

    const relFrom = path.relative(rootDir, fromPath).split(path.sep).join('/');
    movedFrom.add(relFrom);
    const rawContent = editByFile.get(relFrom)?.content ?? fs.readFileSync(fromPath, 'utf8');
    const bodyContent = stripFrontmatter(rawContent);

    const frontmatter = formatFrontmatter({
      title: action.title,
      description: action.description
    });

    const newContent = `${frontmatter}\n${bodyContent}`;

    if (!dryRun) {
      // Create the destination directory
      fs.mkdirSync(path.dirname(toPath), { recursive: true });

      // Delete the source when it differs from the destination
      if (path.resolve(fromPath) !== path.resolve(toPath)) {
        fs.unlinkSync(fromPath);
      }

      fs.writeFileSync(toPath, newContent, 'utf8');
    }

    changes.push({
      from: action.from,
      to: action.to,
      title: action.title,
      description: action.description
    });
  }

  // 1.4 Clean up source directories emptied by the moves (left empty they would be reported as unlisted folders)
  if (!dryRun) {
    const base = path.resolve(rootDir);
    const sourceDirs = new Set<string>();
    for (const action of plan.actions) {
      let dir = path.dirname(path.resolve(rootDir, action.from));
      while (dir !== base && dir.startsWith(base + path.sep)) {
        sourceDirs.add(dir);
        dir = path.dirname(dir);
      }
    }
    // Remove only the empty ones, deepest first
    for (const dir of [...sourceDirs].sort((a, b) => b.length - a.length)) {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
  }

  // 1.5 Rewrite references inside files that do not move
  if (!dryRun) {
    for (const edit of edits) {
      if (!movedFrom.has(edit.file)) {
        fs.writeFileSync(path.join(rootDir, edit.file), edit.content, 'utf8');
      }
    }
  }

  const referenceChanges = edits.flatMap((e) => e.changes);

  if (dryRun) {
    return {
      timestamp: new Date().toISOString(),
      planType: plan.planType,
      changes,
      referenceChanges
    };
  }

  // 3. Write migration-log.json (always saved, with or without git)
  const zoomdocDir = path.resolve(rootDir, '.zoomdoc');
  fs.mkdirSync(zoomdocDir, { recursive: true });

  const log: MigrationLog = {
    timestamp: new Date().toISOString(),
    planType: plan.planType,
    changes,
    referenceChanges,
    // Check for broken links after rewriting (a person judges what remains)
    brokenLinks: findBrokenLinks(rootDir)
  };

  const logPath = path.join(zoomdocDir, 'migration-log.json');
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');

  return log;
}

/**
 * Restore the original layout from migration-log.json (rollback)
 */
export function rollbackMigration(rootDir: string): void {
  const logPath = path.resolve(rootDir, '.zoomdoc', 'migration-log.json');
  if (!fs.existsSync(logPath)) {
    throw new Error('No migration-log.json found to rollback.');
  }

  const log: MigrationLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));

  for (const change of log.changes) {
    resolveInsideRoot(rootDir, change.from);
    resolveInsideRoot(rootDir, change.to);
  }

  // Undo the reference rewrites with the reverse mapping
  const edits = planReferenceRewrites(
    rootDir,
    log.changes.map((c) => ({ from: c.to, to: c.from }))
  );
  const editByFile = new Map(edits.map((e) => [e.file, e]));
  const movedFrom = new Set<string>();

  // Roll back in reverse order
  for (const change of [...log.changes].reverse()) {
    const currentPath = resolveInsideRoot(rootDir, change.to);
    const originalPath = resolveInsideRoot(rootDir, change.from);

    if (fs.existsSync(currentPath)) {
      const relCurrent = path.relative(rootDir, currentPath).split(path.sep).join('/');
      movedFrom.add(relCurrent);
      const content = editByFile.get(relCurrent)?.content ?? fs.readFileSync(currentPath, 'utf8');
      const originalBody = stripFrontmatter(content);

      fs.mkdirSync(path.dirname(originalPath), { recursive: true });
      if (path.resolve(currentPath) !== path.resolve(originalPath)) {
        fs.unlinkSync(currentPath);
      }
      fs.writeFileSync(originalPath, originalBody, 'utf8');
    }
  }

  for (const edit of edits) {
    if (!movedFrom.has(edit.file)) {
      fs.writeFileSync(path.join(rootDir, edit.file), edit.content, 'utf8');
    }
  }

  // Delete migration-log.json
  fs.unlinkSync(logPath);
}
