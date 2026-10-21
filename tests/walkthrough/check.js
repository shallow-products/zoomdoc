#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
/**
 * tests/walkthrough/check.js
 * After the walkthrough, judge the result by machine. It only judges pass or fail and rewrites nothing.
 *   node tests/walkthrough/check.js <store|migrate|migrate-root> <sample directory>
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveDocsRoot, parseSchemaFolderKeys } from '../../scripts/docs_root.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const [scenario, dirArg] = process.argv.slice(2);
if (
  !['store', 'migrate', 'migrate-root', 'dedupe', 'supersede', 'archive'].includes(scenario) ||
  !dirArg
) {
  console.error(
    'usage: node tests/walkthrough/check.js <store|migrate|migrate-root|dedupe|supersede|archive> <dir>'
  );
  process.exit(1);
}
const dir = path.resolve(dirArg);
const state = JSON.parse(fs.readFileSync(path.join(dir, '.walkthrough.json'), 'utf8'));

let failed = 0;
const ok = (msg) => console.log(`✅ ${msg}`);
const ng = (msg) => {
  failed++;
  console.log(`❌ ${msg}`);
};
const warn = (msg) => console.log(`⚠️  ${msg}（目視で確認）`);
const check = (cond, good, bad) => (cond ? ok(good) : ng(bad));

const exists = (rel) => fs.existsSync(path.join(dir, rel));
const read = (rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const listFiles = (rel, re) =>
  exists(rel)
    ? fs
        .readdirSync(path.join(dir, rel))
        .filter((f) => re.test(f) && fs.statSync(path.join(dir, rel, f)).isFile())
    : [];
const frontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
};
const hasField = (fm, key) => new RegExp(`^${key}:\\s*\\S`, 'm').test(fm ?? '');
const walkMd = (rel) => {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) found.push(full);
    }
  };
  if (exists(rel)) walk(path.join(dir, rel));
  return found;
};

const checkFrontmatter = (files, label) => {
  const bad = [];
  for (const f of files) {
    const fm = frontmatter(fs.readFileSync(f, 'utf8'));
    const problems = [];
    if (!hasField(fm, 'title')) problems.push('title なし');
    if (!hasField(fm, 'description')) problems.push('description なし');
    if (hasField(fm, 'created_at') || hasField(fm, 'updated_at'))
      problems.push('日付が書かれている');
    if (problems.length) bad.push(`${path.relative(dir, f)}（${problems.join('、')}）`);
  }
  check(
    bad.length === 0,
    `${label}: Frontmatter は title と description のみで揃っている`,
    `${label}: ${bad.join(' / ')}`
  );
};

const runLint = () => {
  const res = spawnSync('node', [path.join(repoRoot, 'scripts/doc_lint.js')], {
    cwd: dir,
    encoding: 'utf8'
  });
  const issues = res.stdout.split('\n').filter((l) => /^\s+- \[[A-Z_]+\]/.test(l));
  check(
    res.status === 0,
    'zoomdoc:lint が合格',
    `zoomdoc:lint が不合格:\n   ${issues.join('\n   ')}`
  );
};

if (scenario === 'supersede') {
  const adrFile = 'docs/decisions/2026-04-10-session-tokens.md';
  const adrSha = crypto.createHash('sha256').update(read(adrFile)).digest('hex');
  check(
    adrSha === state.adrSha,
    '既存のADRが書き換えられていない',
    '既存のADRが書き換えられた（決定を覆すときは、新しいADRを作る）'
  );
  const decisions = listFiles('docs/decisions', /\.md$/).sort();
  const added = decisions.filter((f) => !state.decisions.includes(f));
  check(
    added.length === 1,
    `新しいADRが1件できた（${added.join(', ')}）`,
    `新しいADRが ${added.length} 件（期待: 1）`
  );
  for (const f of added) {
    check(
      /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f),
      `新しいADRの名前が YYYY-MM-DD-<slug>.md（${f}）`,
      `新しいADRの名前が規則に合わない（${f}）`
    );
    const body = read(`docs/decisions/${f}`);
    check(/30\s*分/.test(body), '新しいADRに「30分」がある', '新しいADRに「30分」が見当たらない');
    if (!/session-tokens|2026-04-10|置き換|変更|従来|旧/.test(body))
      warn('新しいADRが、覆した決定に触れていない');
  }
  runLint();
} else if (scenario === 'archive') {
  const archived = 'docs/archive/cache-spike.md';
  check(
    fs.existsSync(path.join(dir, archived)),
    '設計メモが docs/archive/ へ移された',
    '設計メモが docs/archive/ に無い（削除されたか、動いていない）'
  );
  check(
    !fs.existsSync(path.join(dir, 'docs/architecture/cache-spike.md')),
    '元の場所に設計メモが残っていない',
    '元の場所に設計メモが残っている（複製された）'
  );
  if (fs.existsSync(path.join(dir, archived))) {
    const body = read(archived);
    check(/Redis/.test(body), '内容が保たれている', '内容が失われた');
  }
  const overview = read('docs/architecture/overview.md');
  check(
    !/\]\(cache-spike\.md\)/.test(overview),
    'overview.md の旧リンクが直された',
    'overview.md が旧パスを指したまま'
  );
  runLint();
} else if (scenario === 'dedupe') {
  const guides = listFiles('docs/operations', /\.md$/).sort();
  check(
    JSON.stringify(guides) === JSON.stringify(state.guides),
    `docs/operations のファイルが増えていない（${guides.join(', ')}）`,
    `重複した文書が作られた: ${guides.filter((g) => !state.guides.includes(g)).join(', ')}`
  );
  const body = read('docs/operations/deploy-runbook.md');
  const bodySha = crypto.createHash('sha256').update(body).digest('hex');
  check(
    bodySha !== state.runbookSha,
    'deploy-runbook.md に追記された',
    'deploy-runbook.md が更新されていない'
  );
  check(
    /再デプロイ/.test(body),
    '追記に「再デプロイ」の手順がある',
    '追記に「再デプロイ」の手順が見当たらない'
  );
  const fm = frontmatter(body);
  check(
    hasField(fm, 'title') && hasField(fm, 'description'),
    'Frontmatter が保たれている',
    'Frontmatter が壊れた'
  );
} else if (scenario === 'store') {
  const schemaSha = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(dir, '.zoomdoc/schema.yaml')))
    .digest('hex');
  check(
    schemaSha === state.schemaSha,
    'schema.yaml は変更されていない',
    'schema.yaml が書き換えられた（承認なしの変更）'
  );

  const adr = listFiles('docs/decisions', /\.md$/);
  check(
    adr.length === 1,
    `ADR が docs/decisions/ に 1 件できた（${adr.join(', ')}）`,
    `docs/decisions/ の ADR が ${adr.length} 件（期待: 1）`
  );
  for (const f of adr) {
    check(
      /^\d{4}-\d{2}-\d{2}-.+\.md$/.test(f),
      `ADR の名前が YYYY-MM-DD-<slug>.md（${f}）`,
      `ADR の名前が規則に合わない（${f}）`
    );
    if (!/sqlite/i.test(read(`docs/decisions/${f}`)))
      warn('ADR の本文に SQLite の記述が見当たらない');
  }
  const guides = listFiles('docs/guides', /\.md$/);
  check(
    guides.length >= 1,
    `ガイドが docs/guides/ にできた（${guides.join(', ')}）`,
    'docs/guides/ にガイドができていない'
  );

  const known = new Set(parseSchemaFolderKeys(read('.zoomdoc/schema.yaml')));
  const dirs = fs.existsSync(path.join(dir, 'docs'))
    ? fs
        .readdirSync(path.join(dir, 'docs'), { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => `docs/${e.name}`)
    : [];
  const unknown = dirs.filter((d) => !known.has(d));
  check(
    unknown.length === 0,
    `作られたフォルダは、すべてスキーマで許可されている（${dirs.join(', ')}）`,
    `スキーマに無いフォルダができた: ${unknown.join(', ')}`
  );
  const nested = dirs.flatMap((d) =>
    fs
      .readdirSync(path.join(dir, d), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${d}/${e.name}`)
  );
  check(
    nested.length === 0,
    'サブディレクトリは作られていない',
    `サブディレクトリができた: ${nested.join(', ')}`
  );

  checkFrontmatter(
    [
      ...adr.map((f) => path.join(dir, 'docs/decisions', f)),
      ...guides.map((f) => path.join(dir, 'docs/guides', f))
    ],
    '新しい文書'
  );
  runLint();
} else {
  const root = state.legacyRoot;
  const other = root === 'docs' ? 'documentation' : 'docs';

  check(
    exists('.zoomdoc/schema.yaml'),
    '.zoomdoc/schema.yaml が配備された',
    '.zoomdoc/schema.yaml が無い（初期化されていない）'
  );
  check(
    exists('.zoomdoc/migration-log.json'),
    '移行ログ .zoomdoc/migration-log.json がある',
    '移行ログが無い（apply が実行されていない）'
  );
  if (exists('.zoomdoc/migration-log.json')) {
    try {
      const log = JSON.parse(read('.zoomdoc/migration-log.json'));
      check(
        Array.isArray(log.changes) && log.changes.length > 0,
        `移行ログに ${log.changes?.length} 件の記録がある`,
        '移行ログの changes が空'
      );
    } catch {
      ng('移行ログが JSON として読めない');
    }
  }

  if (exists('.zoomdoc/schema.yaml')) {
    const keys = parseSchemaFolderKeys(read('.zoomdoc/schema.yaml'));
    check(
      deriveDocsRoot(keys) === root,
      `スキーマのルートが ${root}（フォルダ名の共通の親）`,
      `スキーマのルートが ${deriveDocsRoot(keys)}（期待: ${root}）`
    );
  }
  check(
    !exists(other),
    `${other}/ は作られていない`,
    `${other}/ ができている（ルートの回答が反映されていない）`
  );

  const mds = walkMd(root);
  check(
    mds.length === state.mdCount,
    `文書の数が移行前と同じ（${mds.length} 件）`,
    `文書の数が違う: 移行前 ${state.mdCount} 件 → 現在 ${mds.length} 件（消えた、または増えた）`
  );
  checkFrontmatter(mds, '移行後の全文書');

  const appRef = read('src/app.ts').match(/\b([\w-]+\/[\w/.-]+\.md)\b/)?.[1];
  check(
    appRef && exists(appRef),
    `コードのコメントの参照先が実在する（${appRef}）`,
    `コードのコメントの参照先が実在しない（${appRef}）`
  );
  const readmeRef = read('README.md').match(/\]\(([^)]+\.md)\)/)?.[1];
  check(
    readmeRef && exists(readmeRef),
    `README のリンク先が実在する（${readmeRef}）`,
    `README のリンク先が実在しない（${readmeRef}）`
  );
  runLint();
}

console.log(failed === 0 ? '\n🎉 すべて合格' : `\n❌ ${failed} 件が不合格`);
process.exit(failed === 0 ? 0 : 1);
