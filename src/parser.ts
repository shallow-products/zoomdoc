import crypto from 'node:crypto';
import fs from 'node:fs';
import yaml from 'yaml';

export interface FrontmatterResult {
  frontmatter: Record<string, any> | null;
  rawYaml: string;
  hash: string;
  parseError?: string;
}

/**
 * Streams only the frontmatter block (--- ... ---) from the beginning of a file.
 * Avoids loading entire file bodies into memory.
 */
export async function streamFrontmatter(filePath: string): Promise<FrontmatterResult> {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    if (bytesRead === 0) {
      return { frontmatter: null, rawYaml: '', hash: '' };
    }

    const text = buffer.toString('utf8', 0, bytesRead);
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      return { frontmatter: null, rawYaml: '', hash: '' };
    }

    const rawYaml = match[1];
    const hash = crypto.createHash('sha256').update(rawYaml).digest('hex');
    try {
      const parsed = yaml.parse(rawYaml);
      return {
        frontmatter: typeof parsed === 'object' && parsed !== null ? parsed : null,
        rawYaml,
        hash
      };
    } catch (err: any) {
      return {
        frontmatter: null,
        rawYaml,
        hash,
        parseError: err.message || 'YAML parse error'
      };
    }
  } catch {
    return { frontmatter: null, rawYaml: '', hash: '' };
  }
}

/**
 * Read the content of description.md (up to 500 characters summary)
 */
export function readFolderDescription(descFilePath: string): string {
  try {
    if (!fs.existsSync(descFilePath)) {
      return '[NO_DESCRIPTION]';
    }
    const content = fs.readFileSync(descFilePath, 'utf8').trim();
    // Strip leading header (# Title)
    const cleaned = content.replace(/^#\s+[^\n]+\n+/, '').trim();
    return cleaned.slice(0, 500) || '[EMPTY_DESCRIPTION]';
  } catch {
    return '[ERROR_READING_DESCRIPTION]';
  }
}
