#!/usr/bin/env node
/**
 * scripts/hooks/run.js
 * The hook entry point. Runs detection (detect-issues) and injection (sync-triggers) in one process.
 * Node's startup (about 30 ms) is paid once however many detections there are.
 *   node run.js --env=claude [--force]
 */
import { detectIssues } from './detect-issues.js';
import { argValue, findProjectRoot, formatOutput, isFirstAgyInvocation } from './hook-state.js';
import { syncTriggers } from './sync-triggers.js';

const isAGY = argValue(process.argv, 'env') === 'agy';
// At session start (--force) and on Antigravity's first invocation, existing findings are always notified too
const force = process.argv.includes('--force') || (isAGY && isFirstAgyInvocation());
const projectRoot = findProjectRoot();

const out = formatOutput(
  [detectIssues({ projectRoot, force }), syncTriggers({ projectRoot, force })],
  isAGY
);
if (out) console.log(out);
