#!/usr/bin/env node
/**
 * scripts/doc_lint.js
 * zoomdoc static check (it writes nothing):
 *   - detects broken links and anchors, the schema structure (required fields of document entries, template existence), unlisted folders and required front matter
 *   - points out what to investigate semantically (contradictions, duplicates, copied code); the agent investigates and fixes
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { streamFrontmatter } from '../src/parser.ts';
import { findProjectRoot } from '../src/root_finder.ts';
import { findMultipleRoots, getDocsRoot, parseSchemaFolderKeys } from './docs_root.js';
import { checkMarkdownLinks } from './link_check.js';
import { collectMarkdown, findMissingTemplates, findStructureIssues } from './structure_check.js';

const projectRoot = findProjectRoot(process.cwd());
const SCHEMA_FILE = path.join(projectRoot, '.zoomdoc', 'schema.yaml');

const TEMP_FILE_RE = /(~|\.(tmp|bak|swp|swo|orig|rej))$/i;

/** List every file under docs (hidden files included) */
function getAllFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') results.push(...getAllFiles(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

async function runDocLint() {
  // In an uninitialized project, create nothing and only point to init (never generate .zoomdoc/ on its own)
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.log('ℹ️  zoomdoc is not initialized in this project yet.');
    console.log(
      `   (${path.relative(process.cwd(), SCHEMA_FILE) || SCHEMA_FILE} not found)`
    );
    console.log('   Run /zoomdoc:init to set up the document management base.');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 zoomdoc:lint: static check (nothing is written)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let schema = null;
  const schemaErrors = [];

  // 1. Schema Validation (schema syntax & template paths)
  if (fs.existsSync(SCHEMA_FILE)) {
    try {
      const schemaText = fs.readFileSync(SCHEMA_FILE, 'utf8');
      schema = yaml.parse(schemaText);
      console.log('✅ Loaded .zoomdoc/schema.yaml');

      // Hooks and migration read folders with a light line-based parser. Check that it agrees with a real YAML parse
      const yamlKeys = Object.keys(schema?.folders ?? {}).sort();
      const lineKeys = [...parseSchemaFolderKeys(schemaText)].sort();
      if (JSON.stringify(yamlKeys) !== JSON.stringify(lineKeys)) {
        const missing = yamlKeys.filter((k) => !lineKeys.includes(k));
        schemaErrors.push({
          type: 'SCHEMA_PARSE_MISMATCH',
          target: '.zoomdoc/schema.yaml',
          message: `The hooks cannot read these folders: ${missing.join(', ') || '(other differences)'}. Put each folder key on its own line, indented by exactly 2 spaces under "folders:".`
        });
      }

      // Required fields of document entries (documents)
      const REQUIRED_DOCUMENT_FIELDS = ['name', 'description', 'create', 'update'];
      for (const [folderName, folderCfg] of Object.entries(schema?.folders ?? {})) {
        const target = `.zoomdoc/schema.yaml (${folderName})`;
        const documents = folderCfg?.documents;
        if (documents !== undefined && !Array.isArray(documents)) {
          schemaErrors.push({
            type: 'SCHEMA_INVALID_DOCUMENTS',
            target,
            message: '"documents" must be a list of document entries.'
          });
        }
        for (const [i, doc] of (Array.isArray(documents) ? documents : []).entries()) {
          const label = String(doc?.name ?? `#${i + 1}`);
          const lacking = REQUIRED_DOCUMENT_FIELDS.filter((k) => !String(doc?.[k] ?? '').trim());
          if (lacking.length > 0) {
            schemaErrors.push({
              type: 'SCHEMA_MISSING_DOCUMENT_FIELD',
              target,
              message: `Document entry "${label}" is missing: ${lacking.join(', ')}.`
            });
          }
        }
      }

      // Whether the templates referenced by descriptions and document entries exist (same judgment as the hooks)
      for (const m of findMissingTemplates(projectRoot, schemaText)) {
        schemaErrors.push({
          type: 'SCHEMA_MISSING_TEMPLATE',
          target: `.zoomdoc/schema.yaml (${m.folder})`,
          message: `Template file not found on disk: "${m.template}"`
        });
      }
    } catch (e) {
      schemaErrors.push({
        type: 'SCHEMA_SYNTAX_ERROR',
        target: '.zoomdoc/schema.yaml',
        message: `YAML parse error: ${e.message}`
      });
    }
  } else {
    schemaErrors.push({
      type: 'SCHEMA_NOT_FOUND',
      target: '.zoomdoc/schema.yaml',
      message: 'schema.yaml is missing.'
    });
  }

  const docsRootRel = getDocsRoot(projectRoot);
  const docsRoot = path.join(projectRoot, docsRootRel);
  const allMdFiles = collectMarkdown(docsRoot);

  // 2. Validation (broken links, unauthorized folders, missing mandatory frontmatter)
  const layer2Issues = [...schemaErrors];
  const warnings = [];
  const requiredFmFields = ['title', 'description'];

  // Check structure against schema (same judgment as the hooks; this is a static check, so empty folders count too)
  if (fs.existsSync(docsRoot) && schema?.folders) {
    const found = findStructureIssues(projectRoot, docsRootRel, Object.keys(schema.folders), {
      includeEmpty: true
    });
    for (const u of found.unmanaged) {
      layer2Issues.push({
        type: 'UNAUTHORIZED_FOLDER',
        target: u.dir,
        message: `Directory "${u.dir}" is not defined in .zoomdoc/schema.yaml.`
      });
    }
    for (const n of found.nested) {
      layer2Issues.push({
        type: 'ILLEGAL_NESTED_FOLDER',
        target: n,
        message: `Arbitrary nested subdirectory under "${n.split('/').slice(0, -1).join('/')}" is prohibited by governance rules.`
      });
    }
  }

  // Check frontmatter fields and broken links
  for (const filePath of allMdFiles) {
    const relPath = path.relative(projectRoot, filePath);
    const content = fs.readFileSync(filePath, 'utf8');

    // Check frontmatter
    const { frontmatter, parseError } = await streamFrontmatter(filePath);
    if (parseError) {
      layer2Issues.push({
        type: 'INVALID_FRONTMATTER_YAML',
        target: relPath,
        message: `YAML parse error: ${parseError}`
      });
    } else if (!frontmatter) {
      layer2Issues.push({
        type: 'MISSING_FRONTMATTER',
        target: relPath,
        message: 'Missing YAML frontmatter block.'
      });
    } else {
      for (const req of requiredFmFields) {
        if (!frontmatter[req]) {
          layer2Issues.push({
            type: 'MISSING_REQUIRED_FIELD',
            target: relPath,
            message: `Missing mandatory frontmatter field: "${req}"`
          });
        }
      }
    }

    // Check broken internal links (file existence and #anchor existence; code blocks are ignored)
    for (const issue of checkMarkdownLinks(projectRoot, filePath, content)) {
      layer2Issues.push({
        type: issue.kind === 'anchor' ? 'BROKEN_ANCHOR_LINK' : 'BROKEN_MARKDOWN_LINK',
        target: `${relPath}:${issue.line}`,
        message:
          issue.kind === 'anchor'
            ? `Broken anchor: [${issue.label}](${issue.target}) -> heading does not exist in the destination.`
            : `Broken link: [${issue.label}](${issue.target}) -> destination file does not exist.`
      });
    }
  }

  // Warning: hidden / temporary files that should not live in docs/
  for (const f of getAllFiles(docsRoot)) {
    const name = path.basename(f);
    if ((name.startsWith('.') && name !== '.gitkeep') || TEMP_FILE_RE.test(name)) {
      warnings.push({
        type: 'HIDDEN_OR_TEMP_FILE',
        target: path.relative(projectRoot, f),
        message: `Hidden or temporary file inside ${docsRootRel}/. Remove it or add it to .gitignore.`
      });
    }
  }

  // Warning: schema folders must share a single documentation root
  if (schema?.folders) {
    const roots = findMultipleRoots(Object.keys(schema.folders));
    if (roots.length > 0) {
      warnings.push({
        type: 'SCHEMA_MULTIPLE_ROOTS',
        target: '.zoomdoc/schema.yaml',
        message: `Schema folders are spread over several roots (${roots.join(', ')}). Keep them under a single documentation root.`
      });
    }
  }

  // 3. Output Results
  console.log('--- 📋 Findings (deviations from the desired state) ---');
  if (layer2Issues.length === 0) {
    console.log('🎉 No syntax errors, broken links or convention violations were detected (fully consistent).');
  } else {
    console.log(`🚨 ${layer2Issues.length} item(s) to fix were detected:\n`);
    for (const iss of layer2Issues) {
      console.log(`  - [${iss.type}] ${iss.target}: ${iss.message}`);
    }
    console.log('\n[Instructions for the agent / developer]');
    console.log(
      'Check the places above and fix them to match the desired state (this script does not write).'
    );
  }

  if (warnings.length > 0) {
    console.log(`\n--- ⚠️  Warnings (${warnings.length}; they do not affect pass or fail) ---`);
    for (const w of warnings) {
      console.log(`  - [${w.type}] ${w.target}: ${w.message}`);
    }
  }

  console.log('\n--- 🧠 Semantic consistency review points (for the agent to investigate) ---');
  console.log('💡 Points for checking the health of the documents:');
  console.log('  1. Factual contradictions: do different documents disagree about design or specification?');
  console.log(
    '  2. Duplicates: is a similar concept written in several files? (one concept = one file)'
  );
  console.log('  3. Code as the source of truth: are types or function lists that the code already shows written out at length?');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const failCount = layer2Issues.length;
  if (failCount > 0) {
    console.log(`❌ zoomdoc:lint verdict: FAIL (fix ${failCount} item(s))`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(1);
  } else {
    console.log('✅ zoomdoc:lint verdict: PASS (all documents conform to the specification and conventions)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    process.exit(0);
  }
}

runDocLint().catch((err) => {
  console.error('An unexpected error occurred while linting:', err);
  process.exit(1);
});
