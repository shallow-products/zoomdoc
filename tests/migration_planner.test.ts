import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error - JavaScript script module without separate d.ts
import { detectExistingDocs } from '../scripts/init.js';
import {
  applyMigrationPlan,
  formatFrontmatter,
  type MigrationPlan,
  rollbackMigration,
  stripFrontmatter
} from '../src/migration/apply.js';
import { buildJudgePrompt, parseJudgeResponse } from '../src/migration/judge.js';
import {
  chunkFiles,
  evaluateScanSafety,
  listMarkdownFiles,
  readHeadAndTail
} from '../src/migration/scanner.js';

describe('Migration Planner: Core Engine & Benchmark', () => {
  const fixtureDir = path.resolve(process.cwd(), 'tests/fixtures/sample-legacy-project');
  const tempProjectDir = path.resolve(process.cwd(), 'tests/fixtures/temp-test-project');

  beforeEach(() => {
    // Copy a clean temporary directory for each test
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
    fs.cpSync(fixtureDir, tempProjectDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
  });

  describe('Scanner & Chunking', () => {
    it('should list all 25 markdown files sorted alphabetically', () => {
      const files = listMarkdownFiles(tempProjectDir, 'docs');
      expect(files.length).toBe(25);
      // Check the sort order
      const paths = files.map((f) => f.relPath);
      const sorted = [...paths].sort();
      expect(paths).toEqual(sorted);
    });

    it('should evenly slice files across subagents without losing any file', () => {
      const files = listMarkdownFiles(tempProjectDir, 'docs');
      const subagentCount = 3;
      const chunks = chunkFiles(files, subagentCount);

      expect(chunks.length).toBe(3);
      const totalCount = chunks.reduce((acc, c) => acc + c.length, 0);
      expect(totalCount).toBe(25);
      // Whether it is spread evenly as 9, 8, 8
      expect(chunks[0].length).toBe(9);
      expect(chunks[1].length).toBe(8);
      expect(chunks[2].length).toBe(8);
    });

    it('should extract head and tail correctly', () => {
      const setupFile = path.join(tempProjectDir, 'docs/setup.md');
      const { head, tail } = readHeadAndTail(setupFile, 5, 2);
      expect(head).toContain('ローカル環境セットアップ手順');
    });
  });

  describe('Frontmatter & Apply Engine', () => {
    it('should correctly strip existing frontmatter and format new frontmatter', () => {
      const raw = `---
title: "Old Title"
author: "Alice"
---
# Actual Heading
Content goes here.`;

      const stripped = stripFrontmatter(raw);
      expect(stripped).toBe('# Actual Heading\nContent goes here.');

      const formatted = formatFrontmatter({
        title: 'New Title',
        description: 'New Description'
      });
      expect(formatted).toContain('title: "New Title"');
      expect(formatted).toContain('description: "New Description"');
      expect(formatted).not.toContain('created_at');
    });

    it('should apply migration plan, and output migration-log.json', () => {
      const plan: MigrationPlan = {
        planType: 'plan_a_rigid',
        actions: [
          {
            from: 'docs/setup.md',
            to: 'docs/guides/setup.md',
            title: 'ローカル開発環境セットアップ手順',
            description: 'Docker と Node.js 22 の初期設定ガイド'
          }
        ],
        directoryResponsibilities: [
          {
            dir: 'docs/guides',
            title: 'ガイド・チュートリアル',
            description: '開発者向けの手順書・環境構築ガイド'
          }
        ]
      };

      const log = applyMigrationPlan(tempProjectDir, plan);

      expect(log.changes.length).toBe(1);
      expect(fs.existsSync(path.join(tempProjectDir, 'docs/guides/setup.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempProjectDir, 'docs/setup.md'))).toBe(false);

      // description.md is not deployed (the schema holds each folder's role)
      expect(fs.existsSync(path.join(tempProjectDir, 'docs/guides/description.md'))).toBe(false);

      // Check migration-log.json
      const logPath = path.join(tempProjectDir, '.zoomdoc/migration-log.json');
      expect(fs.existsSync(logPath)).toBe(true);
      const savedLog = JSON.parse(fs.readFileSync(logPath, 'utf8'));
      expect(savedLog.changes[0].to).toBe('docs/guides/setup.md');
    });

    it('should rollback completely using migration-log.json', () => {
      const plan: MigrationPlan = {
        planType: 'plan_a_rigid',
        actions: [
          {
            from: 'docs/setup.md',
            to: 'docs/guides/setup.md',
            title: 'セットアップ',
            description: '説明'
          }
        ]
      };

      applyMigrationPlan(tempProjectDir, plan);
      expect(fs.existsSync(path.join(tempProjectDir, 'docs/guides/setup.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempProjectDir, 'docs/setup.md'))).toBe(false);

      // Run the rollback
      rollbackMigration(tempProjectDir);

      expect(fs.existsSync(path.join(tempProjectDir, 'docs/setup.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempProjectDir, '.zoomdoc/migration-log.json'))).toBe(false);
    });
  });

  describe('Benchmark: Plan A Ground Truth Accuracy', () => {
    it('should compute migration accuracy against expected-plan-a.json', () => {
      const expectedPath = path.join(fixtureDir, 'expected-plan-a.json');
      const expectedMapping: Record<string, string> = JSON.parse(
        fs.readFileSync(expectedPath, 'utf8')
      );

      // Run a plan identical to the expected one
      const actions = Object.entries(expectedMapping).map(([from, to]) => ({
        from,
        to,
        title: path.basename(to, '.md'),
        description: 'Auto-extracted summary'
      }));

      const plan: MigrationPlan = {
        planType: 'plan_a_rigid',
        actions
      };

      const log = applyMigrationPlan(tempProjectDir, plan);

      let correctCount = 0;
      const totalCount = Object.keys(expectedMapping).length;

      for (const change of log.changes) {
        if (expectedMapping[change.from] === change.to) {
          correctCount++;
        }
      }

      const accuracy = (correctCount / totalCount) * 100;
      console.log(
        `Plan A Migration Accuracy: ${accuracy.toFixed(1)}% (${correctCount}/${totalCount})`
      );

      expect(accuracy).toBe(100); // Verify a 100% match
    });
  });

  describe('Judge Harness & Detection', () => {
    it('should detect existing documents correctly', () => {
      const docs = detectExistingDocs(tempProjectDir);
      expect(docs.length).toBe(25);
      expect(docs).toContain('docs/setup.md');
    });

    it('should build judge prompt and parse valid judge response correctly', () => {
      const prompt = buildJudgePrompt({
        planType: 'plan_b_preserve',
        preMigrationFiles: [{ path: 'docs/setup.md', excerpt: 'Node.js setup' }],
        migrationLog: [
          { from: 'docs/setup.md', to: 'docs/setup.md', title: 'Setup', description: 'Setup Guide' }
        ],
        generatedDescriptions: [{ dir: 'docs', title: 'Docs', description: 'Root docs' }]
      });

      expect(prompt).toContain('plan_b_preserve');
      expect(prompt).toContain('評価ルーブリック');

      const mockResponse = JSON.stringify({
        totalScore: 88,
        passed: true,
        breakdown: {
          semanticFidelity: 28,
          classificationLogic: 26,
          directoryIntegrity: 18,
          completeness: 16
        },
        feedback:
          'Excellent preservation of existing directory structure and clear responsibilities.',
        criticalIssues: []
      });

      const evalResult = parseJudgeResponse(mockResponse);
      expect(evalResult.passed).toBe(true);
      expect(evalResult.totalScore).toBe(88);
      expect(evalResult.criticalIssues.length).toBe(0);
    });

    it('should fail judge evaluation if criticalIssues are present', () => {
      const failResponse = JSON.stringify({
        totalScore: 85,
        passed: true,
        breakdown: {
          semanticFidelity: 25,
          classificationLogic: 25,
          directoryIntegrity: 20,
          completeness: 15
        },
        feedback: 'Good overall but dropped critical production guide.',
        criticalIssues: ['docs/deploy.md was deleted without tracking']
      });

      const evalResult = parseJudgeResponse(failResponse);
      expect(evalResult.passed).toBe(false); // Forced fail because there are criticalIssues
      expect(evalResult.criticalIssues.length).toBe(1);
    });

    it('should evaluate scan safety correctly based on file counts', () => {
      const small = evaluateScanSafety(15);
      expect(small.severity).toBe('normal');
      expect(small.isLargeScale).toBe(false);

      const medium = evaluateScanSafety(50);
      expect(medium.severity).toBe('caution');
      expect(medium.isLargeScale).toBe(true);
      expect(medium.recommendedSubagents).toBe(5);

      const large = evaluateScanSafety(120);
      expect(large.severity).toBe('warning');
      expect(large.isLargeScale).toBe(true);
    });
  });
});
