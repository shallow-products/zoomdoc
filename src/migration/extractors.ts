import path from 'node:path';
import yaml from 'yaml';

/**
 * What to take from a file during a scan and hand to the LLM.
 * Measured token cost and classification accuracy per strategy are recorded in docs/architecture/scan-strategy-experiment.md.
 */
export type ExtractStrategy =
  | { kind: 'head_tail'; head: number; tail: number }
  | { kind: 'percent'; headPct: number; tailPct: number }
  | { kind: 'headings'; maxLevel?: number }
  | { kind: 'headings_lead'; lead: number }
  | { kind: 'full' };

export const DEFAULT_STRATEGY: ExtractStrategy = { kind: 'head_tail', head: 30, tail: 10 };

/** Named strategies (selectable with the CLI's --strategy) */
export const NAMED_STRATEGIES: Record<string, ExtractStrategy> = {
  head5: { kind: 'head_tail', head: 5, tail: 0 },
  'head15-tail5': { kind: 'head_tail', head: 15, tail: 5 },
  'head30-tail10': { kind: 'head_tail', head: 30, tail: 10 },
  'head50-tail20': { kind: 'head_tail', head: 50, tail: 20 },
  'pct20-10': { kind: 'percent', headPct: 20, tailPct: 10 },
  headings: { kind: 'headings', maxLevel: 3 },
  'headings-lead5': { kind: 'headings_lead', lead: 5 },
  full: { kind: 'full' }
};

export function resolveStrategy(name: string | undefined): ExtractStrategy {
  if (!name) return DEFAULT_STRATEGY;
  const s = NAMED_STRATEGIES[name];
  if (!s)
    throw new Error(
      `Unknown strategy "${name}". Available: ${Object.keys(NAMED_STRATEGIES).join(', ')}`
    );
  return s;
}

/** Token estimate (not a real tokenizer): about 4 characters per token for ASCII, about 1.5 for Japanese and the like */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else wide++;
  }
  return Math.ceil(ascii / 4 + wide / 1.5);
}

export function stripFrontmatterText(content: string): string {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? content.slice(m[0].length) : content;
}

const NON_BODY = new Set(['']);

function sliceHeadTail(lines: string[], head: number, tail: number): string {
  if (lines.length <= head + tail) return lines.join('\n');
  const tailPart = tail > 0 ? lines.slice(-tail) : [];
  return [...lines.slice(0, head), ...(tail > 0 ? ['…'] : []), ...tailPart].join('\n');
}

/** Return the heading lines. Supports Markdown (#), AsciiDoc (=) and reStructuredText (underline) */
function headingLines(lines: string[], ext: string, maxLevel: number): number[] {
  const idx: number[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (ext === '.adoc') {
      const m = line.match(/^(=+)\s+\S/);
      if (m && m[1].length <= maxLevel + 1) idx.push(i);
    } else if (ext === '.rst') {
      const next = lines[i + 1] ?? '';
      if (
        line.trim() &&
        /^([=\-~^"#*+])\1{2,}\s*$/.test(next) &&
        !/^([=\-~^"#*+])\1{2,}\s*$/.test(line)
      ) {
        idx.push(i);
      }
    } else {
      const m = line.match(/^(#{1,6})\s+\S/);
      if (m && m[1].length <= maxLevel) idx.push(i);
    }
  }
  return idx;
}

/** From an OpenAPI / AsyncAPI spec, take only the title, description and list of operations */
function summarizeApiSpec(content: string, ext: string): string | null {
  let doc: unknown;
  try {
    doc = ext === '.json' ? JSON.parse(content) : yaml.parse(content);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, any>;
  if (!d.openapi && !d.swagger && !d.asyncapi) return null;

  const out: string[] = [];
  out.push(
    `${d.openapi ? `openapi ${d.openapi}` : d.swagger ? `swagger ${d.swagger}` : `asyncapi ${d.asyncapi}`}`
  );
  if (d.info?.title)
    out.push(`title: ${d.info.title}${d.info.version ? ` (v${d.info.version})` : ''}`);
  if (d.info?.description)
    out.push(`description: ${String(d.info.description).trim().split('\n')[0]}`);
  if (d.paths && typeof d.paths === 'object') {
    for (const [p, ops] of Object.entries<any>(d.paths).slice(0, 40)) {
      const methods = Object.entries(ops ?? {})
        .filter(([k]) => ['get', 'post', 'put', 'patch', 'delete'].includes(k))
        .map(([k, v]: [string, any]) => `${k.toUpperCase()}${v?.summary ? ` ${v.summary}` : ''}`);
      out.push(`${p}: ${methods.join(' / ')}`);
    }
  }
  if (d.channels && typeof d.channels === 'object') {
    for (const [c, v] of Object.entries<any>(d.channels).slice(0, 40)) {
      out.push(`channel ${c}${v?.description ? `: ${String(v.description).split('\n')[0]}` : ''}`);
    }
  }
  return out.join('\n');
}

/**
 * Build an excerpt from a file according to the strategy.
 * Structured specs (OpenAPI/AsyncAPI) use a dedicated summary chosen by extension, and fall back to head/tail if that fails.
 */
export function extractExcerpt(
  filePath: string,
  rawContent: string,
  strategy: ExtractStrategy = DEFAULT_STRATEGY,
  options: { formatAware?: boolean } = {}
): string {
  const ext = path.extname(filePath).toLowerCase();
  const content = ext === '.md' ? stripFrontmatterText(rawContent) : rawContent;

  if (options.formatAware !== false && ['.yaml', '.yml', '.json'].includes(ext)) {
    const spec = summarizeApiSpec(content, ext);
    if (spec) return spec;
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');

  switch (strategy.kind) {
    case 'full':
      return content.trim();
    case 'head_tail':
      return sliceHeadTail(lines, strategy.head, strategy.tail);
    case 'percent': {
      const head = Math.max(1, Math.ceil((lines.length * strategy.headPct) / 100));
      const tail = Math.ceil((lines.length * strategy.tailPct) / 100);
      return sliceHeadTail(lines, head, tail);
    }
    case 'headings':
    case 'headings_lead': {
      const idx = headingLines(
        lines,
        ext,
        strategy.kind === 'headings' ? (strategy.maxLevel ?? 3) : 3
      );
      if (idx.length === 0) return sliceHeadTail(lines, 30, 10); // Formats without headings fall back to a line slice
      const picked = new Set<number>(idx);
      if (strategy.kind === 'headings_lead') {
        for (let i = 0; i < Math.min(strategy.lead, lines.length); i++) picked.add(i);
      }
      return [...picked]
        .sort((a, b) => a - b)
        .map((i) => lines[i])
        .filter((l) => !NON_BODY.has(l.trim()))
        .join('\n');
    }
  }
}

export interface StrategyRecommendation {
  strategy: string; // A key of NAMED_STRATEGIES
  reason: string;
}

/** File count regarded as large. Beyond it, token savings take priority (the experiment had 24 files, so this threshold is extrapolated) */
export const LARGE_SCALE_FILE_COUNT = 80;

/**
 * Recommend a scan strategy from the file count and the mix of extensions.
 * In the experiment (docs/architecture/scan-strategy-experiment.md), leaving out the tail missed deprecation notes at the end,
 * head30-tail10 had the highest accuracy (95.8%), and pct20-10 reached 91.7% with about half the tokens.
 */
export function recommendScanStrategy(
  fileCount: number,
  extensionCounts: Record<string, number> = {}
): StrategyRecommendation {
  const nonMarkdown = Object.entries(extensionCounts)
    .filter(([ext]) => ext !== '.md')
    .reduce((sum, [, n]) => sum + n, 0);
  const formatNote =
    nonMarkdown > 0
      ? ` ${nonMarkdown} file(s) are not Markdown; for OpenAPI/AsyncAPI the specification summary is used automatically.`
      : '';

  if (fileCount > LARGE_SCALE_FILE_COUNT) {
    return {
      strategy: 'pct20-10',
      reason: `With ${fileCount} files, a proportional slice is recommended: it uses about half the tokens with a small accuracy gap (experiment: 91.7% vs 95.8%). It includes the tail, so deprecation notes are picked up.${formatNote}`
    };
  }
  return {
    strategy: 'head30-tail10',
    reason: `With ${fileCount} files the total tokens are small, so the first 30 plus last 10 lines, which had the highest accuracy in the experiment (95.8%), are recommended.${formatNote}`
  };
}
