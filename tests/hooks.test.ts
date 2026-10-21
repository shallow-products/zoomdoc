import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Lifecycle Hooks (Separated 3-Program Pipeline)', () => {
  it('sync-triggers outputs triggers on schema change or --force, and skips output on unchanged schema', () => {
    const hashFile = path.resolve('.zoomdoc/.schema.hash');
    if (fs.existsSync(hashFile)) {
      fs.unlinkSync(hashFile);
    }

    // 1st run: Hash missing -> Injects triggers and creates hash
    const res1 = execSync('node ./scripts/hooks/sync-triggers.js --env=claude', {
      encoding: 'utf8'
    });
    expect(res1).toContain('[zoomdoc Notice]');
    expect(res1).toContain('.zoomdoc/schema.yaml');
    expect(fs.existsSync(hashFile)).toBe(true);

    // 2nd run: Hash unchanged -> Zero output (0 token overhead)
    const res2 = execSync('node ./scripts/hooks/sync-triggers.js --env=claude', {
      encoding: 'utf8'
    });
    expect(res2.trim()).toBe('');

    // 3rd run: SessionStart mode (--force) -> Always forces notification even when hash is unchanged
    const resForce = execSync('node ./scripts/hooks/sync-triggers.js --env=claude --force', {
      encoding: 'utf8'
    });
    expect(resForce).toContain('[zoomdoc Notice]');
    expect(resForce).toContain('.zoomdoc/schema.yaml');

    // 4th run: AGY invocationNum === 1 -> Always forces notification via stdin JSON
    const agyPayload = JSON.stringify({ invocationNum: 1, conversationId: 'test-session-1' });
    const resAgyFirst = execSync('node ./scripts/hooks/sync-triggers.js --env=agy', {
      input: agyPayload,
      encoding: 'utf8'
    });
    const parsedAgy = JSON.parse(resAgyFirst.trim());
    expect(parsedAgy.injectSteps).toBeDefined();
    expect(parsedAgy.injectSteps[0].ephemeralMessage).toContain('[zoomdoc Notice]');
  });

  it('sync-triggers injects a prose-only schema verbatim, without comments', () => {
    const dir = fs.mkdtempSync(path.join('/tmp', 'zoomdoc-soft-'));
    try {
      fs.mkdirSync(path.join(dir, '.zoomdoc'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.zoomdoc/schema.yaml'),
        '# comment\nfolders:\n  docs/decisions:\n    description: |\n      ADR を1決定1ファイルで置く。\n'
      );
      const res = execSync(
        `node "${path.resolve('scripts/hooks/sync-triggers.js')}" --env=claude --force`,
        { cwd: dir, encoding: 'utf8' }
      );
      expect(res).toContain('[zoomdoc Notice]');
      expect(res).toContain('docs/decisions:');
      expect(res).toContain('ADR を1決定1ファイルで置く。');
      expect(res).not.toContain('# comment');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detect-issues reports missing frontmatter fields as a desired state and never modifies files', () => {
    const testFolder = path.resolve('docs/test_heal_unit');
    const noFm = path.join(testFolder, 'no_frontmatter.md');
    const noDesc = path.join(testFolder, 'no_description.md');

    try {
      fs.mkdirSync(testFolder, { recursive: true });
      const bodyA = '# Detect Only\n\nContent without frontmatter.\n';
      const bodyB = '---\ntitle: "Only Title"\n---\n\n# Only Title\n';
      fs.writeFileSync(noFm, bodyA, 'utf8');
      fs.writeFileSync(noDesc, bodyB, 'utf8');

      const res = execSync(
        'node ./scripts/hooks/detect-issues.js --target=docs/test_heal_unit --env=claude',
        { encoding: 'utf8' }
      );

      expect(res).toContain('Required fields are missing');
      expect(res).toContain('no_frontmatter.md: now: no front matter');
      expect(res).toContain('no_description.md: now: description missing');
      expect(fs.readFileSync(noFm, 'utf8')).toBe(bodyA);
      expect(fs.readFileSync(noDesc, 'utf8')).toBe(bodyB);
    } finally {
      if (fs.existsSync(testFolder)) {
        fs.rmSync(testFolder, { recursive: true, force: true });
      }
    }
  });

  it('detect-issues ignores links inside code blocks and correctly detects broken markdown links with line numbers', () => {
    const testFolder = path.resolve('docs/test_heal_unit');
    const testFile = path.join(testFolder, 'links_sample.md');

    try {
      if (!fs.existsSync(testFolder)) {
        fs.mkdirSync(testFolder, { recursive: true });
      }

      // Content has a dummy link in code block (should NOT be detected)
      // and a real broken link on line 12 (should be detected with line number)
      const content = `---
title: "Link Masking Test"
created_at: "2026-10-08"
updated_at: "2026-10-08"
---

# Code block with example link
\`\`\`markdown
[Example in Code Block](../fake/path/not_exist.md)
\`\`\`

Here is \`[Inline Code Link](../fake/inline.md)\` which should also be ignored.

Here is a real broken link:
[Broken Link](../non_existent_folder/missing.md)
`;

      fs.writeFileSync(testFile, content, 'utf8');

      const res = execSync(
        'node ./scripts/hooks/detect-issues.js --target=docs/test_heal_unit --env=claude',
        {
          encoding: 'utf8'
        }
      );

      expect(res).toContain('[zoomdoc Action Required]');
      expect(res).toContain(
        'docs/test_heal_unit/links_sample.md:15: [Broken Link](../non_existent_folder/missing.md)'
      );
      expect(res).not.toContain('not_exist.md');
      expect(res).not.toContain('fake/inline.md');
    } finally {
      if (fs.existsSync(testFolder)) {
        fs.rmSync(testFolder, { recursive: true, force: true });
      }
    }
  });

  describe('Platform-Specific Hook Protocols (Claude Code vs Antigravity)', () => {
    it('Claude Code (Main): outputs human/agent readable text instructions to stdout', () => {
      const testFolder = path.resolve('docs/test_platform_unit');
      const testFile = path.join(testFolder, 'bad_link.md');

      try {
        if (!fs.existsSync(testFolder)) {
          fs.mkdirSync(testFolder, { recursive: true });
        }
        fs.writeFileSync(
          testFile,
          '---\ntitle: "Claude Test"\ndescription: "claude"\n---\n\n[Broken Link](../non_existent/doc.md)\n',
          'utf8'
        );

        // Run with Claude Code mode (--env=claude)
        const res = execSync(
          'node ./scripts/hooks/detect-issues.js --env=claude --target=docs/test_platform_unit',
          {
            encoding: 'utf8'
          }
        );

        // Claude Code expectation: stdout prompt with Action Required
        expect(res).toContain('[zoomdoc Action Required]');
        expect(res).toContain('Document consistency errors:');
        expect(res).toContain('bad_link.md:6: [Broken Link](../non_existent/doc.md)');
        // Must NOT output raw JSON
        expect(res.trim().startsWith('{')).toBe(false);
      } finally {
        if (fs.existsSync(testFolder)) {
          fs.rmSync(testFolder, { recursive: true, force: true });
        }
      }
    });

    it('Antigravity: injects an ephemeral message when issues exist, and stays silent when clean', () => {
      const testFolder = path.resolve('docs/test_platform_unit');
      const testFile = path.join(testFolder, 'bad_link.md');

      try {
        if (!fs.existsSync(testFolder)) {
          fs.mkdirSync(testFolder, { recursive: true });
        }

        // Case 1: Error present -> injects an ephemeral message
        fs.writeFileSync(
          testFile,
          '---\ntitle: "AGY Test"\ndescription: "agy"\n---\n\n[Broken Link](../non_existent/doc.md)\n',
          'utf8'
        );
        const resError = execSync(
          'node ./scripts/hooks/detect-issues.js --env=agy --target=docs/test_platform_unit',
          {
            encoding: 'utf8'
          }
        );

        const parsedError = JSON.parse(resError.trim());
        const message = parsedError.injectSteps[0].ephemeralMessage;
        expect(message).toContain('[zoomdoc Action Required]');
        expect(message).toContain('bad_link.md:6: [Broken Link](../non_existent/doc.md)');

        // Case 2: Clean state -> no output
        fs.writeFileSync(
          testFile,
          '---\ntitle: "AGY Clean"\ndescription: "clean"\n---\n\nClean text with no links.\n',
          'utf8'
        );
        const resClean = execSync(
          'node ./scripts/hooks/detect-issues.js --env=agy --target=docs/test_platform_unit',
          {
            encoding: 'utf8'
          }
        );
        expect(resClean.trim()).toBe('');
      } finally {
        if (fs.existsSync(testFolder)) {
          fs.rmSync(testFolder, { recursive: true, force: true });
        }
      }
    });

    it('sync-triggers remains completely silent (0 overhead, 0 tokens) when uninitialized', () => {
      // Mock an uninitialized environment in a temporary folder outside projectRoot
      const tempDir = path.resolve('/tmp/test_uninit_repo');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        execSync('git init', { cwd: tempDir });
      }
      const scriptPath = path.resolve('scripts/hooks/sync-triggers.js');

      try {
        // Without --force, it quietly exits 0
        const resQuiet = execSync(`node "${scriptPath}" --env=claude`, {
          cwd: tempDir,
          encoding: 'utf8'
        });
        expect(resQuiet.trim()).toBe('');

        // Even with --force (SessionStart), it remains completely silent because schema.yaml is missing
        const resForce = execSync(`node "${scriptPath}" --env=claude --force`, {
          cwd: tempDir,
          encoding: 'utf8'
        });
        expect(resForce.trim()).toBe('');

        // AGY session start (invocationNum = 1): also completely silent
        const agyPayload = JSON.stringify({ invocationNum: 1 });
        const resAgy = execSync(`node "${scriptPath}" --env=agy`, {
          cwd: tempDir,
          input: agyPayload,
          encoding: 'utf8'
        });
        expect(resAgy.trim()).toBe('');
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });

    it('hooks execute correctly via CLAUDE_PLUGIN_ROOT path resolution', () => {
      const pluginRoot = process.cwd();
      const env = { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot };

      // Test detect-issues via CLAUDE_PLUGIN_ROOT
      const resDetect = execSync(
        `node "\${CLAUDE_PLUGIN_ROOT}/scripts/hooks/detect-issues.js" --env=claude`,
        { env, encoding: 'utf8', shell: '/bin/sh' }
      );
      expect(resDetect).toBeDefined();

      // Test sync-triggers via CLAUDE_PLUGIN_ROOT
      const resSync = execSync(
        `node "\${CLAUDE_PLUGIN_ROOT}/scripts/hooks/sync-triggers.js" --env=claude`,
        { env, encoding: 'utf8', shell: '/bin/sh' }
      );
      expect(resSync).toBeDefined();
    });
  });
});
