#!/usr/bin/env node
/**
 * scripts/hooks/detect-issues.js
 * Layer 2: Pinpoint Static Validation & Semi-Dynamic Action Required Hook (Zero Dependencies)
 * - Detects broken markdown links (ignoring code blocks, with 1-based line numbers)
 * - Detects corrupted Frontmatter syntax (unclosed delimiters, invalid indentations)
 * - Notifies via stdout on Claude Code, or an ephemeral message on Antigravity (no Stop hook; never blocks)
 */
import fs from 'node:fs';
import path from 'node:path';
import { findMultipleRoots, getDocsRoot, parseSchemaFolderKeys } from '../docs_root.js';
import { checkMarkdownLinks } from '../link_check.js';
import {
  collectMarkdown,
  findDuplicateTitles,
  findMissingTemplates,
  findStructureIssues
} from '../structure_check.js';
import {
  argValue,
  findProjectRoot,
  formatOutput,
  isFirstAgyInvocation,
  isHookDisabled,
  isMain,
  loadHookState,
  nextQuiet,
  saveHookState,
  treeSignature
} from './hook-state.js';

/**
 * Return the text when there are consistency findings that should be notified (null otherwise).
 * The only write is .zoomdoc/.cache/hook-state.json.
 *   targetArg: always scan the given folder fully (state is not used)
 *   force: at session start; notify even for an identical finding
 */
export function detectIssues({ projectRoot, targetArg, force: forceNotify = false }) {
  const schemaPath = path.join(projectRoot, '.zoomdoc', 'schema.yaml');

  // Opt-in check: If target is not explicitly passed and schema.yaml is missing, zoomdoc is uninitialized.
  if (!targetArg && !fs.existsSync(schemaPath)) {
    return null;
  }

  const canStaySilent = !targetArg;
  if (!targetArg && isHookDisabled(projectRoot, 'detect-issues')) {
    return null;
  }

  const brokenLinks = [];
  const frontmatterErrors = [];
  const missingFields = [];
  const titled = [];

  let mdFiles = [];
  if (targetArg) {
    const customDir = path.resolve(projectRoot, targetArg);
    if (fs.existsSync(customDir)) {
      mdFiles = collectMarkdown(customDir);
    }
  } else if (fs.existsSync(schemaPath)) {
    try {
      const content = fs.readFileSync(schemaPath, 'utf8');
      for (const folder of parseSchemaFolderKeys(content)) {
        const fullFolder = path.join(projectRoot, folder);
        if (fs.existsSync(fullFolder)) {
          mdFiles.push(...collectMarkdown(fullFolder));
        }
      }
    } catch {
      mdFiles = [];
    }
  }

  // Whether the schema's folders are scattered over several roots (a single root is assumed)
  let rootIssue = '';
  if (!targetArg) {
    try {
      const roots = findMultipleRoots(parseSchemaFolderKeys(fs.readFileSync(schemaPath, 'utf8')));
      if (roots.length > 0) {
        rootIssue = `The folders in schema.yaml are spread over several roots (${roots.join(', ')}). Keep the documentation under a single root.`;
      }
    } catch {
      // If the schema cannot be read, say nothing here
    }
  }

  // Placement consistency (folders not in the schema, subdirectories, missing templates). Nothing is written
  let structure = { unmanaged: [], nested: [] };
  let missingTemplates = [];
  if (!targetArg) {
    try {
      const schemaText = fs.readFileSync(schemaPath, 'utf8');
      structure = findStructureIssues(
        projectRoot,
        getDocsRoot(projectRoot),
        parseSchemaFolderKeys(schemaText)
      );
      missingTemplates = findMissingTemplates(projectRoot, schemaText);
    } catch {
      // If it cannot be read, say nothing here
    }
  }
  const unmanagedFiles = structure.unmanaged.flatMap((u) => u.files);

  // If no target file changed since last time, neither scan nor re-notify
  // A finding that is still unfixed is notified again after a set number of silent prompts
  let watchSignature = null;
  let renotify = false;
  if (canStaySilent) {
    let schemaStamp = '';
    try {
      const st = fs.statSync(schemaPath);
      schemaStamp = `${st.mtimeMs}:${st.size}`;
    } catch {
      // Stays empty if there is none
    }
    watchSignature = treeSignature(
      [schemaStamp, structure.nested.join(','), missingTemplates.length],
      [...mdFiles, ...unmanagedFiles]
    );
    const prev = loadHookState(projectRoot, 'detect-issues');
    if (!forceNotify && prev.sig === watchSignature) {
      const q = nextQuiet(projectRoot, prev);
      if (!q.renotify) {
        if (prev.digest) saveHookState(projectRoot, 'detect-issues', { ...prev, quiet: q.quiet });
        return null;
      }
      renotify = true;
    } else if (forceNotify && prev.sig === watchSignature && !prev.digest && !rootIssue) {
      // Nothing changed since last time and there were no findings. Skip the scan
      return null;
    }
  }

  if (mdFiles.length > 0) {
    for (const filePath of mdFiles) {
      if (path.basename(filePath) === 'description.md') continue;
      const relPath = path.relative(projectRoot, filePath);

      try {
        const content = fs.readFileSync(filePath, 'utf8');

        // 1. Check Frontmatter syntax
        if (content.startsWith('---')) {
          const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
          if (!fmMatch) {
            frontmatterErrors.push({
              source: relPath,
              message: 'Broken front matter syntax (missing or malformed closing `---`)'
            });
          } else {
            const fmText = fmMatch[1];
            for (const fline of fmText.split('\n')) {
              if (fline.startsWith('\t')) {
                frontmatterErrors.push({
                  source: relPath,
                  message: 'Invalid indentation with tab characters (use two spaces)'
                });
                break;
              }
            }
          }
        }

        // 2. Check the mandatory fields (title / description)
        if (!content.startsWith('---')) {
          missingFields.push({ source: relPath, now: 'no front matter' });
        } else {
          const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (fmMatch) {
            const t = fmMatch[1].match(/^title:\s*(.+?)\s*$/m);
            if (t) {
              titled.push({
                path: relPath,
                folder: path.dirname(relPath),
                title: t[1].replace(/^["']|["']$/g, '')
              });
            }
            const lacking = ['title', 'description'].filter(
              (key) => !new RegExp(`^${key}:\\s*\\S`, 'm').test(fmMatch[1])
            );
            if (lacking.length > 0) {
              missingFields.push({ source: relPath, now: `${lacking.join(' and ')} missing` });
            }
          }
        }

        // 3. Check broken internal Markdown links and anchors (shared with zoomdoc:lint)
        for (const issue of checkMarkdownLinks(projectRoot, filePath, content)) {
          brokenLinks.push({
            source: relPath,
            line: issue.line,
            target: issue.target,
            label: issue.label,
            anchor: issue.kind === 'anchor'
          });
        }
      } catch {
        // ignore
      }
    }
  }

  const duplicateTitles = targetArg ? [] : findDuplicateTitles(titled);

  const hasIssues =
    structure.unmanaged.length > 0 ||
    structure.nested.length > 0 ||
    missingTemplates.length > 0 ||
    duplicateTitles.length > 0 ||
    brokenLinks.length > 0 ||
    frontmatterErrors.length > 0 ||
    missingFields.length > 0 ||
    Boolean(rootIssue);

  if (hasIssues) {
    let issueMsg = '';
    if (brokenLinks.length > 0) {
      issueMsg +=
        'Broken internal links were detected (desired state: the link target exists. If you cannot fix it, remove the link):\n';
      for (const bl of brokenLinks) {
        issueMsg += `- ${bl.source}:${bl.line}: [${bl.label}](${bl.target})${bl.anchor ? '(the anchor is not a heading)' : ''}\n`;
      }
    }
    if (frontmatterErrors.length > 0) {
      if (issueMsg) issueMsg += '\n';
      issueMsg +=
        'Broken front matter syntax was detected (desired state: it starts with --- and closes with ---, and is indented with spaces):\n';
      for (const fe of frontmatterErrors) {
        issueMsg += `- ${fe.source}: ${fe.message}\n`;
      }
    }
    if (missingFields.length > 0) {
      if (issueMsg) issueMsg += '\n';
      issueMsg += `Required fields are missing (desired state: front matter has title and description):\n`;
      for (const mf of missingFields) {
        issueMsg += `- ${mf.source}: now: ${mf.now}\n`;
      }
    }
    if (rootIssue) {
      if (issueMsg) issueMsg += '\n';
      issueMsg += `${rootIssue}\n`;
    }
    if (structure.unmanaged.length > 0 || structure.nested.length > 0) {
      if (issueMsg) issueMsg += '\n';
      issueMsg +=
        'Documents are outside the locations the schema defines (desired state: they sit directly in a schema folder. If needed, propose adding a folder):\n';
      for (const u of structure.unmanaged) {
        issueMsg += `- ${u.dir}/: ${u.files.length} document(s) in a folder that is not in the schema\n`;
      }
      for (const n of structure.nested) {
        issueMsg += `- ${n}/: a subdirectory under a folder\n`;
      }
    }
    if (duplicateTitles.length > 0) {
      if (issueMsg) issueMsg += '\n';
      issueMsg +=
        'Documents in the same folder share a title (desired state: one concept per file. If they say the same thing, confirm with the user and merge them into one; if they differ, make the titles distinct):\n';
      for (const d of duplicateTitles) {
        issueMsg += `- 「${d.title}」: ${d.paths.join(', ')}\n`;
      }
    }
    if (missingTemplates.length > 0) {
      if (issueMsg) issueMsg += '\n';
      issueMsg +=
        'A template that the schema refers to does not exist (desired state: the referenced template exists. Create the template or fix the schema reference; get the user\'s approval before changing the schema):\n';
      for (const m of missingTemplates) {
        issueMsg += `- ${m.template}(from the description of ${m.folder})\n`;
      }
    }
    // The same finding is notified only when its content changes and at session start
    const digest = issueMsg;
    if (canStaySilent) {
      const prev = loadHookState(projectRoot, 'detect-issues');
      let notify = forceNotify || renotify || prev.digest !== digest;
      let quiet = 0;
      if (!notify) {
        const q = nextQuiet(projectRoot, prev);
        notify = q.renotify;
        quiet = q.quiet;
      }
      saveHookState(projectRoot, 'detect-issues', { sig: watchSignature, digest, quiet });
      if (!notify) return null;
    }
    issueMsg += `\n[Fix request for the agent]\nFix the items above to match the desired state (check the files that exist under ${getDocsRoot(projectRoot)}/ before fixing).`;

    return { text: `[zoomdoc Action Required] Document consistency errors:\n${issueMsg}`, pad: true };
  }

  // No findings. Remember the signature so the next scan is skipped if nothing changes
  if (canStaySilent)
    saveHookState(projectRoot, 'detect-issues', { sig: watchSignature, digest: '' });
  return null;
}

if (isMain(import.meta.url)) {
  const isAGY = argValue(process.argv, 'env') === 'agy';
  const out = formatOutput(
    [
      detectIssues({
        projectRoot: findProjectRoot(),
        targetArg: argValue(process.argv, 'target'),
        force: process.argv.includes('--force') || (isAGY && isFirstAgyInvocation())
      })
    ],
    isAGY
  );
  if (out) console.log(out);
}
