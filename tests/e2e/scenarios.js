/**
 * tests/e2e/scenarios.js
 * Scenario definitions (data) for the automatic E2E.
 *   setup: scenario name in tests/walkthrough/setup.js (how the sample is built)
 *   check: scenario name in tests/walkthrough/check.js (machine judgment of the result)
 *   turns: conversation turns. The first is the initial request to the agent, the rest are answers to its questions.
 *          each turn continues the previous conversation with --resume.
 *   repeat: default number of repetitions (judge by pass rate)
 *   expect: array of regular expressions (strings) the last turn's answer must match, for read-only scenarios without a check
 *   doneFile: a file that marks the work as done (a path relative to the sample). If it is still missing after the turns,
 *             send a nudge up to maxNudges times to continue (a countermeasure for runs that stop after asking for approval twice)
 */
const NUDGE = '承認済みです。これ以上の確認は不要です。そのまま実行を完了してください。';
const MIGRATE_TURNS = (rootAnswer) => [
  '/zoomdoc:init',
  rootAnswer,
  '推奨案に従ってください。',
  'dry-run の一覧を確認しました。承認します。実行してください。'
];

export const scenarios = {
  dedupe: {
    description:
      '起票（重複確認）: docs/operations に手順書が1件ある。内容が近い依頼で、新規作成せず追記を期待する',
    setup: 'dedupe',
    check: 'dedupe',
    repeat: 3,
    turns: [
      '本番デプロイを巻き戻す手順（直前のタグに戻して再デプロイする、の2ステップ）を、運用手順として残して。'
    ]
  },
  supersede: {
    description:
      '決定を覆す: docs/decisions に既存のADR（トークンの有効期限15分）がある。30分に変えると頼み、既存を書き換えず新しいADRを期待する',
    setup: 'supersede',
    check: 'supersede',
    repeat: 3,
    turns: [
      'アクセストークンの有効期限を、15分から30分に変えることにした。更新トークンの7日・回転は変えない。決定として残して。'
    ]
  },
  archive: {
    description:
      '片付け: 設計メモ（キャッシュ検証）が決定になった。docs/archive へ移し、旧リンクを直すことを期待する',
    setup: 'archive',
    check: 'archive',
    repeat: 3,
    turns: [
      'docs/architecture/cache-spike.md の検証は終わって、Redis でキャッシュする決定になった。この設計メモは役目を終えたので、片付けて。',
      '承認します。実行してください。'
    ]
  },
  search: {
    description: '検索: 初期化済みで文書が7件ある。トークンの有効期限と更新の仕組みを尋ねる',
    setup: 'search',
    check: null,
    repeat: 3,
    expect: ['15\\s*分', '7\\s*日'],
    turns: ['ログイン後のアクセストークンの有効期限と、更新の仕組みを教えて。']
  },
  store: {
    description: '起票: 初期化済み、docs/ のフォルダは無い。ADR とガイドを続けて頼む',
    setup: 'store',
    check: 'store',
    repeat: 3,
    turns: [
      'SQLite を採用することにした。依存を増やさず1ファイルで配れるのが理由。決定記録（ADR）を残して。',
      '開発環境のセットアップ手順を、ガイドとして書いて。npm install と docker compose up だけでいい。'
    ]
  },
  migrate: {
    description: '移行: 25件の古い文書、ルートは docs（標準）',
    setup: 'migrate',
    check: 'migrate',
    repeat: 3,
    doneFile: '.zoomdoc/migration-log.json',
    nudge: NUDGE,
    maxNudges: 2,
    turns: MIGRATE_TURNS('ドキュメントのフォルダは標準（docs/）でお願いします。')
  },
  'migrate-root': {
    description: '移行: 古い文書のルートが documentation。ルートを別名のまま使う',
    setup: 'migrate-root',
    check: 'migrate-root',
    repeat: 3,
    doneFile: '.zoomdoc/migration-log.json',
    nudge: NUDGE,
    maxNudges: 2,
    turns: MIGRATE_TURNS('ドキュメントのフォルダは documentation にします。')
  }
};
