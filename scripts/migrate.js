#!/usr/bin/env node
/**
 * scripts/migrate.js
 * CLI entry point for migrating existing documents (scan / plan / dry-run / apply / log / rollback).
 * The implementation is src/migration/cli.ts. The distributed form is bundled as dist/migrate.js.
 */
import { runMigrateCli } from '../src/migration/cli.ts';

const { exitCode, stdout } = runMigrateCli(process.argv.slice(2));
if (stdout) console.log(stdout);
process.exitCode = exitCode;
