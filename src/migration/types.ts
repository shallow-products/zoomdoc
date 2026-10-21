/**
 * src/migration/types.ts
 * Shared type definitions for migration planning, dynamic E2E evaluation and token efficiency metrics
 */

/**
 * 1. Document metadata at the scan stage
 */
export interface ScannedDocMeta {
  path: string; // Relative path e.g. "docs/setup.md"
  title: string; // Estimated or extracted title
  summary: string; // One- or two-sentence summary
  tokenCount?: number; // Estimated tokens used during extraction
  extension?: string; // File extension e.g. ".md", ".txt", ".yaml"
}

/**
 * 2. Migration action (moving one file and adding front matter)
 */
export interface MigrationAction {
  from: string; // Source path
  to: string; // Destination path
  title: string; // Front matter title to add
  description: string; // Front matter description to add
}

/**
 * 3. Directory responsibility definition
 */
export interface DirectoryResponsibility {
  dir: string; // Directory path e.g. "docs/guides"
  title: string; // Directory name and category
  description: string; // What the directory is responsible for (used to propose the schema's description)
}

/**
 * 4. Migration plan proposal (the form shown to the user)
 */
export type MigrationPlanType = 'plan_a_rigid' | 'plan_b_preserve' | 'plan_c_hybrid';

export interface MigrationPlanProposal {
  planType: MigrationPlanType;
  title: string;
  strategyDescription: string;
  pros: string[];
  cons: string[];
  actions: MigrationAction[];
  directoryResponsibilities: DirectoryResponsibility[];
  schemaGaps?: { type: string; target: string; message: string; suggestion?: string }[]; // Differences from schema.yaml
  estimatedCost?: {
    totalTokens: number;
    subagentCount: number;
    estimatedCostUsd: number;
  };
}

/**
 * 5. Migration execution log (the format of .zoomdoc/migration-log.json)
 */
export interface MigrationExecutionLog {
  timestamp: string;
  planType: MigrationPlanType;
  changes: MigrationAction[];
  referenceChanges?: { file: string; line: number; before: string; after: string }[]; // References that were rewritten
  brokenLinks?: { file: string; line: number; target: string }[]; // Broken links remaining after applying
  metadata?: {
    totalFiles: number;
    executedBy: string;
  };
}

/**
 * 6. Dynamic E2E and LLM-as-a-Judge evaluation results
 */
export interface EvaluationRubricBreakdown {
  semanticFidelity: number; // Up to 30 points: semantic fidelity of summaries and titles
  classificationLogic: number; // Up to 30 points: validity of classification and relocation
  directoryIntegrity: number; // Up to 20 points: consistency of directory responsibilities
  completeness: number; // Up to 20 points: completeness and non-destructiveness
}

export interface DynamicEvaluationReport {
  runId: string;
  evaluatedAt: string;
  planType: MigrationPlanType;
  totalScore: number; // 0 to 100 points
  passed: boolean; // Pass or fail (totalScore >= 80 and no criticalIssues)
  breakdown: EvaluationRubricBreakdown;
  feedback: string;
  criticalIssues: string[];
  tokenEfficiencyMetrics: {
    totalInputTokens: number;
    averageTokensPerFile: number;
    scorePerTokenRatio: number; // Points / average tokens per file
  };
}

/**
 * 7. Scan scale and safety diagnosis
 */
export type SafetySeverity = 'normal' | 'caution' | 'warning';

export interface ScanSafetyAssessment {
  fileCount: number;
  severity: SafetySeverity;
  recommendedSubagents: number;
  isLargeScale: boolean;
  message: string;
}
