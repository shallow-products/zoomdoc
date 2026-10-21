import fs from 'node:fs';
import path from 'node:path';
import { getDocsRoot, normalizeDocsRoot } from '../../scripts/docs_root.js';
import { findProjectRoot } from '../root_finder.js';
import { loadSchema } from '../schema_loader.js';
import {
  type MigrationPlan,
  applyMigrationPlan,
  formatFrontmatter,
  rollbackMigration
} from './apply.js';
import {
  estimateTokens,
  extractExcerpt,
  recommendScanStrategy,
  resolveStrategy
} from './extractors.js';
import { analyzeSchemaGaps } from './gaps.js';
import { buildMigrationProposals, recommendPlan, validateClassifiedDocs } from './planner.js';
import { findBrokenLinks } from './rewrite_refs.js';
import { chunkFiles, evaluateScanSafety, listScannableFiles } from './scanner.js';
import type { MigrationExecutionLog } from './types.js';

export const USAGE = `zoomdoc migrate <subcommand> [options]

  scan     [--dir <docsRoot>] [--strategy head30-tail10] [--ext md,txt,yaml] [--chunks N]
             Print excerpts and a size diagnosis as JSON (the agent summarizes and classifies). Strategies: head5 / head15-tail5 / head30-tail10 / head50-tail20 / pct20-10 / headings / headings-lead5 / full
  plan     --extracted <file.json> [--type a|b|c] [--out <plan.json>]
             Generate options A/B/C from the classified summaries. With --type, print one option in an applicable form
  dry-run  --plan <plan.json>
             Change nothing; list move sources → destinations, front matter to add, references to rewrite and existing broken links
  apply    --plan <plan.json>
             Perform the moves, front matter additions and reference rewrites, and write .zoomdoc/migration-log.json
  log      Show the contents of migration-log.json
  rollback Restore the original layout from migration-log.json

Common: --root <dir> (default: detect the project root) / --json (JSON output)
      --docs-root <dir> (the documentation root. Default: derived from the folder names in schema.yaml, else docs)`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string | true> } {
  const [cmd = '', ...rest] = argv;
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { cmd, flags };
}

function strFlag(flags: Record<string, string | true>, name: string): string | undefined {
  const v = flags[name];
  if (v === true) throw new Error(`--${name} requires a value`);
  return v;
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPlan(file: string): MigrationPlan {
  const plan = readJson(file) as MigrationPlan;
  if (!plan || !Array.isArray(plan.actions) || !plan.planType) {
    throw new Error(`Invalid plan file (planType/actions required): ${file}`);
  }
  return plan;
}

const PLAN_TYPES: Record<string, MigrationPlan['planType']> = {
  a: 'plan_a_rigid',
  b: 'plan_b_preserve',
  c: 'plan_c_hybrid'
};

function renderLog(log: MigrationExecutionLog, title: string): string {
  const lines = [`${title}: ${log.planType} / ${log.changes.length} file(s)`, ''];
  for (const c of log.changes) {
    lines.push(c.from === c.to ? `  = ${c.from}` : `  ${c.from} -> ${c.to}`);
  }
  const refs = log.referenceChanges ?? [];
  lines.push('', `Reference rewrites: ${refs.length}`);
  for (const r of refs) {
    lines.push(`  ${r.file}:${r.line}`, `    - ${r.before}`, `    + ${r.after}`);
  }
  if (log.brokenLinks) {
    lines.push('', `Broken links: ${log.brokenLinks.length}`);
    for (const b of log.brokenLinks) lines.push(`  ${b.file}:${b.line} -> ${b.target}`);
  }
  return lines.join('\n');
}

export function runMigrateCli(argv: string[], cwd: string = process.cwd()): CliResult {
  try {
    const { cmd, flags } = parseArgs(argv);
    if (!cmd || cmd === 'help' || flags.help) return { exitCode: 0, stdout: USAGE };

    const root = path.resolve(strFlag(flags, 'root') ?? findProjectRoot(cwd));
    const docsRootFlag = strFlag(flags, 'docs-root');
    const docsRoot = docsRootFlag ? normalizeDocsRoot(docsRootFlag) : getDocsRoot(root);
    const asJson = flags.json === true;
    const out = (value: unknown, text: string): CliResult => ({
      exitCode: 0,
      stdout: asJson ? JSON.stringify(value, null, 2) : text
    });
    const resolveFile = (name: string) => path.resolve(cwd, name);

    switch (cmd) {
      case 'scan': {
        const dir = strFlag(flags, 'dir') ?? docsRoot;
        const strategyName = strFlag(flags, 'strategy');
        const strategy = resolveStrategy(strategyName);
        const extensions = (strFlag(flags, 'ext') ?? 'md').split(',').map((e) => e.trim());
        const targets = listScannableFiles(root, dir, extensions).filter(
          (t) => path.basename(t.relPath) !== 'description.md'
        );
        const safety = evaluateScanSafety(targets.length);
        const chunkCount = Number(strFlag(flags, 'chunks') ?? 1);
        const excerpts = targets.map((t) => {
          const excerpt = extractExcerpt(t.fullPath, fs.readFileSync(t.fullPath, 'utf8'), strategy);
          return {
            path: t.relPath.split(path.sep).join('/'),
            excerpt,
            tokens: estimateTokens(excerpt)
          };
        });
        const extensionCounts: Record<string, number> = {};
        for (const t of targets) {
          const ext = path.extname(t.relPath).toLowerCase();
          extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
        }
        const result = {
          root,
          strategy: strategyName ?? 'head30-tail10',
          recommendedStrategy: recommendScanStrategy(targets.length, extensionCounts),
          safety,
          totalTokens: excerpts.reduce((sum, e) => sum + e.tokens, 0),
          chunks: chunkFiles(excerpts, chunkCount)
        };
        return {
          exitCode: 0,
          stdout: JSON.stringify(result, null, 2)
        };
      }

      case 'plan': {
        const extracted = strFlag(flags, 'extracted');
        if (!extracted) throw new Error('plan requires --extracted <file.json>');
        const docs = validateClassifiedDocs(readJson(resolveFile(extracted)));
        const schema = loadSchema(root);
        const proposals = buildMigrationProposals(docs, docsRoot).map((p) => ({
          ...p,
          schemaGaps: analyzeSchemaGaps(schema, p.actions, docsRoot)
        }));
        const type = strFlag(flags, 'type');
        if (!type) {
          const recommendation = recommendPlan(docs);
          return { exitCode: 0, stdout: JSON.stringify({ recommendation, proposals }, null, 2) };
        }

        const planType = PLAN_TYPES[type.toLowerCase()];
        if (!planType) throw new Error('--type must be one of a, b, c');
        const chosen = proposals.find((p) => p.planType === planType);
        if (!chosen) throw new Error(`Plan not found: ${type}`);
        const plan: MigrationPlan = {
          planType: chosen.planType,
          actions: chosen.actions,
          directoryResponsibilities: chosen.directoryResponsibilities
        };
        const outFile = strFlag(flags, 'out');
        if (outFile) fs.writeFileSync(resolveFile(outFile), JSON.stringify(plan, null, 2), 'utf8');
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ...plan, schemaGaps: chosen.schemaGaps }, null, 2)
        };
      }

      case 'dry-run': {
        const planFile = strFlag(flags, 'plan');
        if (!planFile) throw new Error('dry-run requires --plan <plan.json>');
        const plan = loadPlan(resolveFile(planFile));
        const log = applyMigrationPlan(root, plan, { dryRun: true });
        const frontmatters = plan.actions.map((a) => ({
          to: a.to,
          frontmatter: formatFrontmatter({
            title: a.title,
            description: a.description
          })
        }));
        const existingBrokenLinks = findBrokenLinks(root);
        const schemaGaps = analyzeSchemaGaps(loadSchema(root), plan.actions, docsRoot);
        const result = { ...log, frontmatters, existingBrokenLinks, schemaGaps };
        const text = [
          renderLog(log, 'DRY-RUN (nothing was changed)'),
          '',
          `Broken links that existed before applying (not rewritten): ${existingBrokenLinks.length}`,
          ...existingBrokenLinks.map((b) => `  ${b.file}:${b.line} -> ${b.target}`),
          '',
          `Differences from schema.yaml: ${schemaGaps.length}`,
          ...schemaGaps.map(
            (g) => `  [${g.type}] ${g.message}\n      Default handling: ${g.suggestion}`
          ),
          ...(schemaGaps.length > 0
            ? ['  Note: schema.yaml is changed only if the user approves this plan']
            : []),
          '',
          'Front matter to be added:',
          ...frontmatters.map((f) => `# ${f.to}\n${f.frontmatter.trimEnd()}`)
        ].join('\n');
        return out(result, text);
      }

      case 'apply': {
        const planFile = strFlag(flags, 'plan');
        if (!planFile) throw new Error('apply requires --plan <plan.json>');
        const log = applyMigrationPlan(root, loadPlan(resolveFile(planFile)));
        return out(log, `${renderLog(log, 'APPLIED')}\n\nLog: .zoomdoc/migration-log.json`);
      }

      case 'log': {
        const logPath = path.join(root, '.zoomdoc', 'migration-log.json');
        const log = readJson(logPath) as MigrationExecutionLog;
        return out(log, renderLog(log, `LOG (${log.timestamp})`));
      }

      case 'rollback': {
        rollbackMigration(root);
        return { exitCode: 0, stdout: 'Rolled back and removed .zoomdoc/migration-log.json' };
      }

      default:
        return { exitCode: 1, stdout: `Unknown subcommand: ${cmd}\n\n${USAGE}` };
    }
  } catch (e) {
    return { exitCode: 1, stdout: `Error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
