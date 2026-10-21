#!/usr/bin/env node
/**
 * scripts/init.js
 * Scaffolds zoomdoc governance and template structure into target project.
 * Designed to be zero external dependencies and non-destructive.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_DOCS_ROOT,
  normalizeDocsRoot,
  rebaseSchemaText
} from './docs_root.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, '..');

// Helper to determine target project root
export function getTargetProjectRoot(start = process.cwd()) {
  let curr = path.resolve(start);
  const root = path.parse(curr).root;
  while (curr !== root) {
    if (fs.existsSync(path.join(curr, '.zoomdoc'))) return curr;
    if (fs.existsSync(path.join(curr, '.git'))) return curr;
    if (
      fs.existsSync(path.join(curr, 'package.json')) &&
      !fs.existsSync(path.join(curr, '.claude-plugin'))
    ) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
}

/**
 * Copy file non-destructively (does not overwrite existing target)
 */
function safeCopyFile(src, dest) {
  if (fs.existsSync(dest)) {
    return false; // Skipped
  }
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  return true;
}

/**
 * Execute initialization
 */
export function initZoomdoc(targetRoot = getTargetProjectRoot(), options = {}) {
  const docsRoot = normalizeDocsRoot(options.docsRoot ?? DEFAULT_DOCS_ROOT);
  const result = {
    targetRoot,
    created: [],
    skipped: []
  };

  const targetZoomdocDir = path.join(targetRoot, '.zoomdoc');
  const targetTemplatesDir = path.join(targetZoomdocDir, 'templates');

  if (!fs.existsSync(targetZoomdocDir)) {
    fs.mkdirSync(targetZoomdocDir, { recursive: true });
  }
  if (!fs.existsSync(targetTemplatesDir)) {
    fs.mkdirSync(targetTemplatesDir, { recursive: true });
  }

  // 1. Copy schema.yaml
  const schemaSrc = path.join(pluginRoot, '.zoomdoc', 'schema.yaml');
  const schemaDest = path.join(targetZoomdocDir, 'schema.yaml');
  if (fs.existsSync(schemaSrc)) {
    if (!fs.existsSync(schemaDest)) {
      fs.writeFileSync(
        schemaDest,
        rebaseSchemaText(fs.readFileSync(schemaSrc, 'utf8'), docsRoot),
        'utf8'
      );
      result.created.push('.zoomdoc/schema.yaml');
    } else {
      result.skipped.push('.zoomdoc/schema.yaml');
    }
  }

  // 2. Copy templates
  const templatesSrcDir = path.join(pluginRoot, '.zoomdoc', 'templates');
  if (fs.existsSync(templatesSrcDir)) {
    const tmplEntries = fs.readdirSync(templatesSrcDir, { withFileTypes: true });
    for (const ent of tmplEntries) {
      if (ent.isFile() && ent.name.endsWith('.md')) {
        const sPath = path.join(templatesSrcDir, ent.name);
        const dPath = path.join(targetTemplatesDir, ent.name);
        if (safeCopyFile(sPath, dPath)) {
          result.created.push(`.zoomdoc/templates/${ent.name}`);
        } else {
          result.skipped.push(`.zoomdoc/templates/${ent.name}`);
        }
      }
    }
  }

  return result;
}

/**
 * Detect existing markdown documentation in target docs directory (excluding description.md)
 */
export function detectExistingDocs(targetRoot, docsRelDir = 'docs') {
  const targetDocsDir = path.join(targetRoot, docsRelDir);
  if (!fs.existsSync(targetDocsDir)) return [];

  const found = [];
  function walk(curr) {
    const entries = fs.readdirSync(curr, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(curr, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith('.md') && ent.name !== 'description.md') {
        found.push(path.relative(targetRoot, full));
      }
    }
  }
  walk(targetDocsDir);
  return found.sort();
}

// Direct CLI invocation
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--docs-root');
  const docsRoot = flagIdx >= 0 ? normalizeDocsRoot(args[flagIdx + 1]) : DEFAULT_DOCS_ROOT;
  if (flagIdx >= 0) args.splice(flagIdx, 2);
  const targetDir = args[0] ? path.resolve(args[0]) : getTargetProjectRoot();
  console.log(`🚀 Initializing zoomdoc in: ${targetDir}`);

  const res = initZoomdoc(targetDir, { docsRoot });

  if (res.created.length > 0) {
    console.log('✅ Created:');
    for (const f of res.created) {
      console.log(`  + ${f}`);
    }
  }
  if (res.skipped.length > 0) {
    console.log('ℹ️  Skipped (already exists):');
    for (const f of res.skipped) {
      console.log(`  - ${f}`);
    }
  }
  console.log('\n🎉 zoomdoc setup complete! Next: check existing documents with /zoomdoc:lint.');
}
