import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { type ExtractStrategy, estimateTokens, extractExcerpt } from './extractors.ts';

/**
 * Harness for the scan strategy comparison experiment (docs/architecture/scan-strategy-experiment.md).
 * Classifies documents from excerpts alone and compares, per strategy, the agreement with the correct labels and the token cost.
 */
export const EXPERIMENT_LABELS = [
  ['product', '何を・誰のために作るか(要件・ビジョン)'],
  ['architecture', '今どういう構造・設計か(システム構造・API仕様・DB)'],
  ['decisions', 'なぜそう決めたか(ADR)'],
  ['guides', '手順書(環境構築・デプロイ・運用手順)'],
  ['conventions', '共通ルール・規約'],
  ['evaluation', '品質評価・テスト戦略・非機能要件・ベンチマーク'],
  ['archive', '廃止・破棄された、または役目を終えた資料(参照禁止)']
] as const;

export interface CorpusItem {
  id: string;
  ext: string;
  raw: string;
  label: string;
  note?: string; // e.g. a trap with a deprecation note added at the end
}

const DEPRECATION_TAIL =
  '\n\n---\n【廃止】この文書は役目を終えました。現行の内容は別の文書を参照してください。参照禁止。\n';

function shortHash(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 6);
}

/** So that paths leak no hints, IDs are content-independent hashes and the order follows the IDs */
function assignIds(items: Omit<CorpusItem, 'id'>[], seed: string): CorpusItem[] {
  return items
    .map((it, i) => ({ ...it, id: `d${shortHash(`${seed}:${i}:${it.raw.length}`)}` }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Turn this repository's docs/ into a corpus whose correct labels are the folder names the documents sit in */
export function buildMarkdownCorpus(repoRoot: string, trapCount = 3): CorpusItem[] {
  const docsDir = path.join(repoRoot, 'docs');
  const items: Omit<CorpusItem, 'id'>[] = [];
  for (const folder of fs.readdirSync(docsDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(docsDir, folder.name))) {
      if (!f.endsWith('.md') || f === 'description.md') continue;
      const raw = fs.readFileSync(path.join(docsDir, folder.name, f), 'utf8');
      items.push({ ext: '.md', raw, label: folder.name });
    }
  }
  // Build documents with a deprecation note only at the end (head-only strategies miss it) from long documents
  const longest = [...items]
    .filter((i) => i.label === 'architecture')
    .sort((a, b) => b.raw.length - a.raw.length)
    .slice(0, trapCount);
  for (const base of longest) {
    items.push({
      ext: '.md',
      raw: base.raw + DEPRECATION_TAIL,
      label: 'archive',
      note: 'tail-deprecation'
    });
  }
  return assignIds(items, 'md');
}

/** Corpus of non-Markdown formats (tests/fixtures/scan-formats) */
export function buildFormatCorpus(fixtureDir: string): CorpusItem[] {
  const labels: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, 'labels.json'), 'utf8')
  );
  const items = Object.entries(labels).map(([file, label]) => ({
    ext: path.extname(file),
    raw: fs.readFileSync(path.join(fixtureDir, file), 'utf8'),
    label
  }));
  return assignIds(items, 'fmt');
}

export interface PreparedPrompt {
  prompt: string;
  perDocTokens: number; // Estimated tokens per excerpt (average)
  totalTokens: number;
}

export function buildClassificationPrompt(
  corpus: CorpusItem[],
  strategy: ExtractStrategy,
  options: { formatAware?: boolean } = {}
): PreparedPrompt {
  const excerpts = corpus.map((it) => ({
    it,
    text: extractExcerpt(`${it.id}${it.ext}`, it.raw, strategy, options)
  }));
  const tokens = excerpts.map((e) => estimateTokens(e.text));
  const total = tokens.reduce((a, b) => a + b, 0);

  const labelList = EXPERIMENT_LABELS.map(([k, d]) => `- ${k}: ${d}`).join('\n');
  const body = excerpts
    .map(({ it, text }) => `<doc id="${it.id}" format="${it.ext}">\n${text}\n</doc>`)
    .join('\n\n');

  const prompt = `あなたは文書整理の担当者です。下の各 <doc> は、ファイルの一部だけを抜き出した抜粋です(ファイル名は分かりません)。
抜粋だけを根拠に、各文書を次のカテゴリのどれか1つに分類してください。

${labelList}

出力は、文書IDをキー、カテゴリ名を値とする JSON オブジェクトだけにしてください(説明やコードフェンスは不要)。
例: {"d1a2b3c": "guides"}

${body}
`;
  return { prompt, perDocTokens: Math.round(total / corpus.length), totalTokens: total };
}

export interface ScoreResult {
  total: number;
  correct: number;
  accuracy: number;
  trapTotal: number;
  trapCorrect: number;
  misses: { id: string; expected: string; predicted: string; note?: string }[];
}

export function scoreResponses(
  corpus: CorpusItem[],
  responses: Record<string, string>
): ScoreResult {
  const misses: ScoreResult['misses'] = [];
  let correct = 0;
  let trapTotal = 0;
  let trapCorrect = 0;
  for (const it of corpus) {
    const predicted = String(responses[it.id] ?? '(none)')
      .trim()
      .toLowerCase();
    const ok = predicted === it.label;
    if (ok) correct++;
    else misses.push({ id: it.id, expected: it.label, predicted, note: it.note });
    if (it.note) {
      trapTotal++;
      if (ok) trapCorrect++;
    }
  }
  return {
    total: corpus.length,
    correct,
    accuracy: correct / corpus.length,
    trapTotal,
    trapCorrect,
    misses
  };
}
