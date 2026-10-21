import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrateCli } from '../src/migration/cli.ts';
import {
  estimateTokens,
  extractExcerpt,
  NAMED_STRATEGIES,
  recommendScanStrategy,
  resolveStrategy
} from '../src/migration/extractors.ts';

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

describe('extractExcerpt', () => {
  it('slices head/tail and drops the frontmatter of Markdown', () => {
    const md = `---\ntitle: x\n---\n${lines(100)}`;
    const out = extractExcerpt('a.md', md, NAMED_STRATEGIES.head5);
    expect(out).toBe(lines(5));
    const ht = extractExcerpt('a.md', md, NAMED_STRATEGIES['head15-tail5']);
    expect(ht).toContain('line 15');
    expect(ht).toContain('line 100');
    expect(ht).not.toContain('line 16');
    expect(ht).not.toContain('title: x');
  });

  it('returns short files unchanged and supports percentage slicing', () => {
    expect(extractExcerpt('a.md', lines(10), NAMED_STRATEGIES['head30-tail10'])).toBe(lines(10));
    const pct = extractExcerpt('a.md', lines(100), NAMED_STRATEGIES['pct20-10']);
    expect(pct).toContain('line 20');
    expect(pct).not.toContain('line 21');
    expect(pct).toContain('line 100');
    expect(pct).toContain('line 91');
  });

  it('extracts headings (ignoring fenced code) for Markdown, AsciiDoc and reStructuredText', () => {
    const md = '# A\ntext\n```\n# not heading\n```\n## B\n#### too deep\n';
    expect(extractExcerpt('a.md', md, NAMED_STRATEGIES.headings)).toBe('# A\n## B');
    expect(extractExcerpt('a.adoc', '= Title\nx\n== Sec\ny\n', NAMED_STRATEGIES.headings)).toBe(
      '= Title\n== Sec'
    );
    const rst = 'Title\n=====\nbody\nSection\n-------\nmore\n';
    expect(extractExcerpt('a.rst', rst, NAMED_STRATEGIES.headings)).toBe('Title\nSection');
    // Formats without headings fall back to a line slice
    expect(extractExcerpt('a.txt', 'plain\ntext', NAMED_STRATEGIES.headings)).toBe('plain\ntext');
  });

  it('summarizes OpenAPI and AsyncAPI specs instead of slicing them', () => {
    const openapi =
      'openapi: 3.0.0\ninfo:\n  title: Pay API\n  version: 1.0.0\npaths:\n  /pay:\n    post:\n      summary: Create\n    get:\n      summary: List\n';
    const out = extractExcerpt('a.yaml', openapi, NAMED_STRATEGIES.head5);
    expect(out).toContain('title: Pay API (v1.0.0)');
    expect(out).toContain('/pay: POST Create / GET List');

    const asyncapi = JSON.stringify({
      asyncapi: '2.6.0',
      info: { title: 'Events', version: '1' },
      channels: { 'order.paid': { description: 'paid' } }
    });
    expect(extractExcerpt('e.json', asyncapi, NAMED_STRATEGIES.head5)).toContain(
      'channel order.paid: paid'
    );
    // With formatAware:false it is an ordinary line slice
    expect(extractExcerpt('a.yaml', openapi, NAMED_STRATEGIES.head5, { formatAware: false })).toBe(
      openapi.split('\n').slice(0, 5).join('\n')
    );
  });

  it('estimates tokens higher for Japanese than ASCII of the same length and rejects unknown names', () => {
    expect(estimateTokens('a'.repeat(40))).toBe(10);
    expect(estimateTokens('あ'.repeat(30))).toBe(20);
    expect(() => resolveStrategy('nope')).toThrow(/Unknown strategy/);
  });
});

describe('recommendScanStrategy', () => {
  it('recommends head30-tail10 up to 80 files and a percentage slice beyond', () => {
    expect(recommendScanStrategy(25).strategy).toBe('head30-tail10');
    expect(recommendScanStrategy(80).strategy).toBe('head30-tail10');
    const large = recommendScanStrategy(120, { '.md': 100, '.yaml': 20 });
    expect(large.strategy).toBe('pct20-10');
    expect(large.reason).toContain('With 120 files');
    expect(large.reason).toContain('20 file(s)');
  });
});

describe('migrate scan options', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoomdoc-scan-'));
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs/a.md'), `# A\n${lines(100)}`);
    fs.writeFileSync(path.join(dir, 'docs/b.txt'), 'plain text');
    fs.writeFileSync(path.join(dir, 'docs/c.yaml'), 'openapi: 3.0.0\ninfo:\n  title: C\n');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies --strategy and includes non-Markdown files with --ext', () => {
    const md = JSON.parse(
      runMigrateCli(['scan', '--root', dir, '--strategy', 'headings'], dir).stdout
    );
    expect(md.chunks.flat().map((e: { path: string }) => e.path)).toEqual(['docs/a.md']);
    expect(md.strategy).toBe('headings');
    expect(md.recommendedStrategy.strategy).toBe('head30-tail10');
    expect(md.chunks.flat()[0].excerpt).toBe('# A');

    const all = JSON.parse(
      runMigrateCli(['scan', '--root', dir, '--ext', 'md,txt,yaml'], dir).stdout
    );
    expect(all.chunks.flat().map((e: { path: string }) => e.path)).toEqual([
      'docs/a.md',
      'docs/b.txt',
      'docs/c.yaml'
    ]);
    expect(all.totalTokens).toBeGreaterThan(0);
    expect(runMigrateCli(['scan', '--root', dir, '--strategy', 'bogus'], dir).exitCode).toBe(1);
  });
});

describe('experiment harness', () => {
  it('builds an anonymized corpus with tail-deprecation traps and scores responses', async () => {
    const { buildMarkdownCorpus, buildClassificationPrompt, scoreResponses } = await import(
      '../src/migration/experiment.ts'
    );
    const corpus = buildMarkdownCorpus(path.resolve(__dirname, '..'));
    const traps = corpus.filter((c) => c.note === 'tail-deprecation');
    expect(traps).toHaveLength(3);
    expect(traps.every((t) => t.label === 'archive')).toBe(true);
    expect(corpus.every((c) => /^d[0-9a-f]{6}$/.test(c.id))).toBe(true);

    const head = buildClassificationPrompt(corpus, NAMED_STRATEGIES.head5);
    const full = buildClassificationPrompt(corpus, NAMED_STRATEGIES.full);
    expect(head.totalTokens).toBeLessThan(full.totalTokens);
    // A head-only excerpt does not include the deprecation note at the end
    expect(head.prompt).not.toContain('【廃止】この文書は役目を終えました');
    expect(full.prompt).toContain('【廃止】この文書は役目を終えました');

    const perfect = Object.fromEntries(corpus.map((c) => [c.id, c.label]));
    expect(scoreResponses(corpus, perfect).accuracy).toBe(1);
    const wrong = { ...perfect, [traps[0].id]: 'architecture' };
    const res = scoreResponses(corpus, wrong);
    expect(res.trapCorrect).toBe(2);
    expect(res.misses).toHaveLength(1);
  });
});
