import type {
  DirectoryResponsibility,
  DynamicEvaluationReport,
  EvaluationRubricBreakdown,
  MigrationAction,
  MigrationPlanType
} from './types.js';

export interface JudgeInput {
  planType: MigrationPlanType;
  preMigrationFiles: { path: string; excerpt: string }[];
  migrationLog: MigrationAction[];
  generatedDescriptions: DirectoryResponsibility[];
}

export type JudgeEvaluation = {
  totalScore: number;
  passed: boolean;
  breakdown: EvaluationRubricBreakdown;
  feedback: string;
  criticalIssues: string[];
};

/**
 * Build the evaluation prompt for LLM-as-a-Judge
 */
export function buildJudgePrompt(input: JudgeInput): string {
  return `あなたは zoomdoc ドキュメント移行品質の独立した厳格な監査官（LLM Judge）です。
以下の移行前ドキュメントと、適用された移行結果（プラン: ${input.planType}）を評価し、100点満点で採点してください。

## 評価ルーブリック (合計100点)
1. **要約・タイトルの意味的忠実度 (最大30点)**:
   - title と description が本文内容を正確に反映しているか。ハルシネーションや不当な省略がないか。
2. **分類・再配置の妥当性 (最大30点)**:
   - プランBの場合: 既存パスが維持され、無理な改変がないか。
   - プランCの場合: 有効な仕様・ガイドが適切に整理され、古いメモや一時ファイルのみが archive/ に選別されているか。
3. **ディレクトリ責務の整合性 (最大20点)**:
   - 各ディレクトリに配備された description.md の内容が、配下ファイルの共通責務と整合しているか。
4. **完全性と非破壊性 (最大20点)**:
   - 元のファイルがすべて漏れなく追跡（migration-log）されているか。重要情報が失われていないか。

## 合格基準
- totalScore >= 80 かつ criticalIssues が空であること。

## 入力データ

### 移行前ドキュメント一覧
${JSON.stringify(input.preMigrationFiles, null, 2)}

### 適用された移行ログ (migration-log)
${JSON.stringify(input.migrationLog, null, 2)}

### 生成されたディレクトリ責務 (description.md)
${JSON.stringify(input.generatedDescriptions, null, 2)}

## 回答フォーマット
必ず以下の純粋な JSON フォーマットのみを出力してください（マークダウンのコードブロック等は含めないでください）。
{
  "totalScore": 85,
  "passed": true,
  "breakdown": {
    "semanticFidelity": 27,
    "classificationLogic": 26,
    "directoryIntegrity": 17,
    "completeness": 15
  },
  "feedback": "全体的な評価コメント",
  "criticalIssues": []
}
`;
}

/**
 * Parse the Judge's response JSON and type-check it
 */
export function parseJudgeResponse(rawJson: string): JudgeEvaluation {
  const cleaned = rawJson
    .trim()
    .replace(/^```json/, '')
    .replace(/```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned);

  const totalScore = Number(parsed.totalScore) || 0;
  const passed = totalScore >= 80 && (!parsed.criticalIssues || parsed.criticalIssues.length === 0);

  return {
    totalScore,
    passed,
    breakdown: {
      semanticFidelity: Number(parsed.breakdown?.semanticFidelity) || 0,
      classificationLogic: Number(parsed.breakdown?.classificationLogic) || 0,
      directoryIntegrity: Number(parsed.breakdown?.directoryIntegrity) || 0,
      completeness: Number(parsed.breakdown?.completeness) || 0
    },
    feedback: parsed.feedback || '',
    criticalIssues: Array.isArray(parsed.criticalIssues) ? parsed.criticalIssues : []
  };
}
