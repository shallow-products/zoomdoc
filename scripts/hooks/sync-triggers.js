#!/usr/bin/env node
/**
 * scripts/hooks/sync-triggers.js
 * A hook that injects the schema (.zoomdoc/schema.yaml) into the agent at session start and when it changes.
 * It passes the schema as is (without comments and blank lines), unsummarized. It writes nothing to documents.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  argValue,
  findProjectRoot,
  formatOutput,
  isFirstAgyInvocation,
  isHookDisabled,
  isMain
} from './hook-state.js';

const NOTICE_HEAD =
  '[zoomdoc Notice] This project keeps its specifications, designs, decisions and procedures only in the schema\'s folders. If a folder does not exist yet, that kind of document does not exist yet. Do not search elsewhere with find or grep; check only inside the relevant folder (list the title and description before opening a body). Before answering a question in general terms or asking back, first look at the relevant documents (zoomdoc:read). When writing or updating, follow zoomdoc:write; when moving or deleting, zoomdoc:move; when changing the schema, zoomdoc:schema. Handle documents according to the document entries of each schema folder (name, description, create, update, template, remove). The content of .zoomdoc/schema.yaml follows:';

/**
 * Return the text when the schema should be injected (null if not needed). The only write is .schema.hash.
 */
export function syncTriggers({ projectRoot, force = false }) {
  const schemaPath = path.join(projectRoot, '.zoomdoc', 'schema.yaml');

  // In a project without schema.yaml, zoomdoc is not enabled. Print nothing and finish.
  if (!fs.existsSync(schemaPath)) return null;
  if (isHookDisabled(projectRoot, 'sync-triggers')) return null;

  const hashPath = path.join(projectRoot, '.zoomdoc', '.schema.hash');

  // force: session start (--force) or Antigravity's first invocation. Always inject
  try {
    const content = fs.readFileSync(schemaPath, 'utf8');
    const currentHash = crypto.createHash('sha256').update(content).digest('hex');
    const prevHash = fs.existsSync(hashPath) ? fs.readFileSync(hashPath, 'utf8').trim() : '';

    if (force || currentHash !== prevHash) {
      const body = content
        .split('\n')
        .filter((l) => l.trim() && !l.trim().startsWith('#'))
        .join('\n');
      fs.writeFileSync(hashPath, currentHash, 'utf8');
      return { text: `${NOTICE_HEAD}\n\n${body}`, pad: false };
    }
  } catch {
    // Stay silent if it cannot be read
  }
  return null;
}

if (isMain(import.meta.url)) {
  const isAGY = argValue(process.argv, 'env') === 'agy';
  const force = process.argv.includes('--force') || (isAGY && isFirstAgyInvocation());
  const out = formatOutput([syncTriggers({ projectRoot: findProjectRoot(), force })], isAGY);
  if (out) console.log(out);
}
