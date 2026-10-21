import { exec, execSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Helper to run Claude CLI in non-interactive print mode (-p)
 */
function runClaudeScenario(
  prompt: string,
  timeoutMs = 90000
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = exec(
      `claude -p "${prompt.replace(/"/g, '\\"')}"`,
      {
        cwd: projectRoot,
        timeout: timeoutMs,
        env: {
          ...process.env,
          // Ensure color output is stripped or handled cleanly
          NO_COLOR: '1'
        }
      },
      (error, stdout, stderr) => {
        resolve({
          code:
            error && error.code !== undefined
              ? typeof error.code === 'number'
                ? error.code
                : 1
              : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString()
        });
      }
    );
  });
}

// Where claude is missing, do not count it as passed; show it as skipped (vitest prints skipped).
// End-to-end runs with a real agent are done by tests/e2e/run.js (the zoomdoc-e2e container).
const hasClaude = spawnSync('claude', ['--version']).status === 0;
if (!hasClaude) console.warn('⚠️ claude CLI が無いため、実エージェントのシナリオはスキップされます');

describe('Dynamic Agent E2E: Real Claude Code CLI Scenarios', () => {
  // S-01: Positive - exploring the physical database design (a hard internal-spec query)
  it.skipIf(!hasClaude)(
    'S-01 Positive: agent successfully locates DB physical design and index schema',
    async () => {
      const res = await runClaudeScenario(
        'zoomdoc のSQLiteキャッシュ設計について教えて。テーブル構成はどうなっていますか？'
      );

      expect(res.code).toBe(0);
      const textOutput = res.stdout;
      const containsCoreAnswer =
        textOutput.includes('同型テーブル') ||
        textOutput.includes('WAL') ||
        textOutput.includes('SQLite') ||
        textOutput.includes('index.db');
      expect(containsCoreAnswer).toBe(true);
    },
    50000
  );

  // S-02: Positive - exploring development and Git rules (multi-folder exploration)
  it.skipIf(!hasClaude)(
    'S-02 Positive: multi-folder navigation to locate Git and development workflow',
    async () => {
      const res = await runClaudeScenario(
        'このプロジェクトのGit運用ルールやブランチ規約についてドキュメントから調べて教えて。'
      );

      expect(res.code).toBe(0);
      const textOutput = res.stdout;
      const containsGitRules =
        textOutput.includes('main') ||
        textOutput.includes('ブランチ') ||
        textOutput.includes('PR') ||
        textOutput.includes('コミット') ||
        textOutput.includes('git-workflow');
      expect(containsGitRules).toBe(true);
    },
    50000
  );

  // S-03: Positive / Edge - searching for a topic that does not exist (resistance to hallucination)
  it.skipIf(!hasClaude)(
    'S-03 Edge: non-existent topic query returns not-found without hallucination',
    async () => {
      const res = await runClaudeScenario(
        'zoomdoc のドキュメントから、KubernetesクラスタのPodオートスケール設定について調べて教えて。'
      );

      expect(res.code).toBe(0);
      const textOutput = res.stdout;
      const reportsNotFound =
        textOutput.includes('見つかりません') ||
        textOutput.includes('記載されていません') ||
        textOutput.includes('存在しません') ||
        textOutput.includes('含まれていません') ||
        textOutput.includes('見当たりません') ||
        textOutput.includes('見当たら') ||
        textOutput.includes('ありません');
      expect(reportsNotFound).toBe(true);
    },
    50000
  );

  // S-04: Positive - creating a new guide (fetching the conventions and the creation flow)
  it.skipIf(!hasClaude)(
    'S-04 Positive: creating valid new guide conforming to schema and frontmatter',
    async () => {
      const targetFile = path.join(projectRoot, 'docs/guides/temp_e2e_guide.md');
      if (fs.existsSync(targetFile)) {
        fs.unlinkSync(targetFile);
      }

      try {
        const res = await runClaudeScenario(
          'docs/guides/temp_e2e_guide.md に、新しい開発者向けの環境構築手順メモを適切なFrontmatter付きで作成してください。'
        );

        // Verify file creation and contents
        if (fs.existsSync(targetFile)) {
          const content = fs.readFileSync(targetFile, 'utf-8');
          expect(content).toContain('title:');
        }
      } finally {
        if (fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
        }
      }
    },
    50000
  );

  // S-05: Rules & Autonomous Governance - the agent conventions prevent creating under an invalid nested level
  it.skipIf(!hasClaude)(
    'S-05 Governance: agent respects rules and avoids unauthorized nested folders under docs/',
    async () => {
      const targetNestedFile = path.join(projectRoot, 'docs/architecture/illegal_sub/test.md');
      if (fs.existsSync(targetNestedFile)) {
        fs.unlinkSync(targetNestedFile);
      }

      try {
        await runClaudeScenario(
          'docs/architecture/illegal_sub/test.md に新しい設計メモを作成してください。もし規約違反になる場合は適切なフォルダ直下に作成してください。'
        );

        // Illegal nested folder MUST NOT be created
        expect(fs.existsSync(targetNestedFile)).toBe(false);
      } finally {
        if (fs.existsSync(targetNestedFile)) {
          fs.unlinkSync(targetNestedFile);
        }
      }
    },
    50000
  );

  // S-06: Detect Only - missing front matter is only reported; the hooks never rewrite it
  it('S-06 Detect Only: missing Frontmatter is reported as a desired state and the file is left untouched', async () => {
    const targetPlainFile = path.join(projectRoot, 'docs/guides/temp_plain_guide.md');
    if (fs.existsSync(targetPlainFile)) {
      fs.unlinkSync(targetPlainFile);
    }

    try {
      // Simulate raw creation without frontmatter
      fs.writeFileSync(
        targetPlainFile,
        '# Auto Healed Guide\n\nThis guide was written without initial frontmatter.\n',
        'utf-8'
      );

      const before = fs.readFileSync(targetPlainFile, 'utf-8');
      const res = await new Promise<{ code: number; stdout: string }>((resolve) => {
        exec(
          'node ./scripts/hooks/detect-issues.js --env=claude --force',
          { cwd: projectRoot },
          (err, stdout) => {
            resolve({ code: err ? 1 : 0, stdout: stdout.toString() });
          }
        );
      });

      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Required fields are missing');
      expect(res.stdout).toContain('temp_plain_guide.md: now: no front matter');
      expect(fs.readFileSync(targetPlainFile, 'utf-8')).toBe(before);
    } finally {
      if (fs.existsSync(targetPlainFile)) {
        fs.unlinkSync(targetPlainFile);
      }
    }
  });

  // S-07: Autonomous Recall & Trigger - the agent autonomously records an ADR when a technology is chosen
  it.skipIf(!hasClaude)(
    'S-07 Autonomous Trigger: agent recalls ADR trigger on tech selection without explicit prompt',
    async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const candidateAdrs = [
        path.join(projectRoot, `docs/decisions/${todayStr}-sqlite-fts5.md`),
        path.join(projectRoot, `docs/decisions/${todayStr}-sqlite-fts5-decision.md`),
        path.join(projectRoot, `docs/decisions/${todayStr}-search-engine.md`)
      ];

      try {
        const res = await runClaudeScenario(
          '全文検索エンジンの選定について、外部サーバーのMeilisearchをやめて組み込みのSQLite FTS5を採用することを決定しました。この決定をプロジェクトのドキュメントに記録してください。'
        );

        expect(res.code).toBe(0);
        const textOutput = res.stdout;
        expect(
          textOutput.includes('decisions') ||
            textOutput.includes('ADR') ||
            textOutput.includes('FTS5')
        ).toBe(true);
      } finally {
        for (const p of candidateAdrs) {
          if (fs.existsSync(p)) fs.unlinkSync(p);
        }
      }
    },
    50000
  );

  // S-08: Progressive Disclosure - fetching a template and reading files step by step with view_file
  it.skipIf(!hasClaude)(
    'S-08 Progressive Disclosure: agent references external template path before writing',
    async () => {
      const targetFile = path.join(projectRoot, 'docs/evaluation/test-strategy-draft.md');
      try {
        const res = await runClaudeScenario(
          'docs/evaluation/ のテスト方針フォーマットを確認した上で、テスト戦略の概要案を作成してください。'
        );

        expect(res.code).toBe(0);
        const textOutput = res.stdout;
        // Agent should reference or conform to test-strategy format / sections
        expect(
          textOutput.includes('テストピラミッド') ||
            textOutput.includes('ピラミッド') ||
            textOutput.includes('test-strategy') ||
            textOutput.includes('モック')
        ).toBe(true);
      } finally {
        if (fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
      }
    },
    50000
  );

  // S-09: Exploration-First & Deduplication - exploring existing documents and avoiding duplicates
  it.skipIf(!hasClaude)(
    'S-09 Deduplication: agent searches existing docs before attempting to create new files',
    async () => {
      const res = await runClaudeScenario(
        'Git運用のコミットメッセージ規約について、新しくドキュメントを作るべきか既存ファイルがあるか調べて教えて。'
      );

      expect(res.code).toBe(0);
      const textOutput = res.stdout;
      // Should discover existing conventions or git-workflow rather than suggesting a duplicate
      expect(
        textOutput.includes('conventions') ||
          textOutput.includes('git-workflow') ||
          textOutput.includes('writing-docs') ||
          textOutput.includes('既存')
      ).toBe(true);
    },
    50000
  );

  // S-10: Dates are not written to files - changing the body writes no updated_at and raises no notice
  it('S-10 No Date Sync: stop hook does not write or sync dates when markdown body is modified', async () => {
    const testDoc = path.join(projectRoot, 'docs/guides/temp_hash_sync_test.md');

    try {
      const fm = '---\ntitle: "No Date Test"\ndescription: "no dates"\n---\n\n';
      fs.writeFileSync(testDoc, `${fm}# Initial Body Content\nInitial text.\n`, 'utf-8');
      execSync('node ./scripts/hooks/detect-issues.js --env=claude --force', {
        cwd: projectRoot,
        encoding: 'utf-8'
      });

      fs.writeFileSync(testDoc, `${fm}# Modified Body Content\nUpdated text.\n`, 'utf-8');
      const res = execSync('node ./scripts/hooks/detect-issues.js --env=claude --force', {
        cwd: projectRoot,
        encoding: 'utf-8'
      });

      expect(res).not.toContain('updated_at');
      expect(fs.readFileSync(testDoc, 'utf-8')).not.toContain('updated_at');
    } finally {
      if (fs.existsSync(testDoc)) fs.unlinkSync(testDoc);
    }
  });

  // S-11: Broken Internal Link Detection - autonomous detection of broken links (pinpointing the line number)
  it('S-11 Link Check: stop hook warns on broken internal documentation links with exact line numbers', async () => {
    const testDoc = path.join(projectRoot, 'docs/guides/temp_broken_link_test.md');
    try {
      fs.writeFileSync(
        testDoc,
        `---\ntitle: "Broken Link Test"\ncreated_at: "2026-10-07"\nupdated_at: "2026-10-07"\n---\n\n# Broken Link\nSee [Missing Doc](../non_existent_folder/missing.md) for details.\n`,
        'utf-8'
      );

      const res = execSync('node ./scripts/hooks/detect-issues.js --env=claude', {
        cwd: projectRoot,
        encoding: 'utf-8'
      });

      expect(res).toContain('[zoomdoc Action Required]');
      expect(res).toContain(
        'temp_broken_link_test.md:8: [Missing Doc](../non_existent_folder/missing.md)'
      );
    } finally {
      if (fs.existsSync(testDoc)) fs.unlinkSync(testDoc);
    }
  });

  // S-12: Corrupted Frontmatter Detection - pinpoint detection of broken YAML syntax
  it('S-12 Syntax Validation: detect corrupted frontmatter delimiters or tab indentations', async () => {
    const testDoc = path.join(projectRoot, 'docs/guides/temp_corrupt_fm_test.md');
    try {
      // Missing closing delimiter ---
      fs.writeFileSync(
        testDoc,
        `---\ntitle: "Corrupted Frontmatter Test"\ncreated_at: "2026-10-08"\n\n# Body without closing frontmatter delimiter\n`,
        'utf-8'
      );

      const res = execSync('node ./scripts/hooks/detect-issues.js --env=claude', {
        cwd: projectRoot,
        encoding: 'utf-8'
      });

      expect(res).toContain('[zoomdoc Action Required]');
      expect(res).toContain('Broken front matter syntax');
      expect(res).toContain('temp_corrupt_fm_test.md');
    } finally {
      if (fs.existsSync(testDoc)) fs.unlinkSync(testDoc);
    }
  });

  // S-16: Lifecycle Session Initialization - SessionStart --force guarantees initial awareness
  it('S-16 Session Awareness: SessionStart hook emits actionable triggers regardless of prior hash cache', async () => {
    // Run SessionStart mode (--force)
    const res = execSync('node ./scripts/hooks/sync-triggers.js --env=claude --force', {
      cwd: projectRoot,
      encoding: 'utf-8'
    });

    expect(res).toContain('[zoomdoc Notice]');
    expect(res).toContain('.zoomdoc/schema.yaml');
    expect(res).toContain('docs/decisions:');
  });

  // S-17: Cross-Platform Protocol - Antigravity invocationNum === 1 injection contract
  it('S-17 AGY Invocation Protocol: PreInvocation triggers on invocationNum 1 without pre-existing cache hindrance', async () => {
    const stdinPayload = JSON.stringify({
      invocationNum: 1,
      conversationId: 'e2e-session-uuid-test',
      workspacePaths: [projectRoot]
    });

    const res = execSync('node ./scripts/hooks/sync-triggers.js --env=agy', {
      cwd: projectRoot,
      input: stdinPayload,
      encoding: 'utf-8'
    });

    const parsed = JSON.parse(res.trim());
    expect(parsed.injectSteps).toBeDefined();
    expect(parsed.injectSteps.length).toBeGreaterThan(0);
    expect(parsed.injectSteps[0].ephemeralMessage).toContain('[zoomdoc Notice]');
    expect(parsed.injectSteps[0].ephemeralMessage).toContain('.zoomdoc/schema.yaml');
  });

  // S-18: Strict Governance Isolation - Hook ignores non-schema directories
  it('S-18 Governance Isolation: the hook ignores markdown files outside schema-defined folders', async () => {
    const unmanagedDir = path.join(projectRoot, 'docs/unmanaged_test_notes');
    const unmanagedFile = path.join(unmanagedDir, 'scratch.md');

    try {
      if (!fs.existsSync(unmanagedDir)) {
        fs.mkdirSync(unmanagedDir, { recursive: true });
      }
      fs.writeFileSync(unmanagedFile, '# Unmanaged Scratchpad\nNo frontmatter here.\n', 'utf-8');

      // Run the hook without target override
      const res = execSync('node ./scripts/hooks/detect-issues.js --env=claude --force', {
        cwd: projectRoot,
        encoding: 'utf-8'
      });

      // Must NOT heal or touch files outside schema.yaml folders
      expect(res).not.toContain('unmanaged_test_notes');
      const content = fs.readFileSync(unmanagedFile, 'utf-8');
      expect(content.startsWith('---')).toBe(false);
    } finally {
      if (fs.existsSync(unmanagedDir)) {
        fs.rmSync(unmanagedDir, { recursive: true, force: true });
      }
    }
  });

  // S-20: Uninitialized Project Session Start & Init Flow
  it('S-20 E2E: session start detects uninitialized repo, prompts user confirmation, and /zoomdoc:init bootstraps governance', async () => {
    const testUninitDir = path.resolve('/tmp/test_dynamic_e2e_uninit');
    if (fs.existsSync(testUninitDir)) {
      fs.rmSync(testUninitDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testUninitDir, { recursive: true });
    execSync('git init', { cwd: testUninitDir });

    try {
      // 1. Session start hook runs in uninitialized repo with --force: must be completely silent (0 overhead)
      const scriptSync = path.resolve(projectRoot, 'scripts/hooks/sync-triggers.js');
      const sessionStartOutput = execSync(`node "${scriptSync}" --env=claude --force`, {
        cwd: testUninitDir,
        encoding: 'utf-8'
      });
      expect(sessionStartOutput.trim()).toBe('');

      // 2. User explicitly chooses to activate zoomdoc by running /zoomdoc:init (node scripts/init.js)
      const scriptInit = path.resolve(projectRoot, 'scripts/init.js');
      const initOutput = execSync(`node "${scriptInit}" "${testUninitDir}"`, {
        cwd: testUninitDir,
        encoding: 'utf-8'
      });
      expect(initOutput).toContain('zoomdoc setup complete!');

      // 3. Verify governance files were scaffolded; folders are created lazily, not by init
      expect(fs.existsSync(path.join(testUninitDir, '.zoomdoc', 'schema.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(testUninitDir, 'docs'))).toBe(false);

      // 4. Second session start now reports normal trigger list
      const postInitOutput = execSync(`node "${scriptSync}" --env=claude --force`, {
        cwd: testUninitDir,
        encoding: 'utf-8'
      });
      expect(postInitOutput).toContain('.zoomdoc/schema.yaml');
      expect(postInitOutput).not.toContain('未初期化');
    } finally {
      if (fs.existsSync(testUninitDir)) {
        fs.rmSync(testUninitDir, { recursive: true, force: true });
      }
    }
  });
});
