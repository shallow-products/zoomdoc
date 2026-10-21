import path from 'node:path';
import type { SchemaDefinition } from '../schema_loader.js';

export interface SchemaGap {
  type: 'UNAUTHORIZED_FOLDER';
  target: string;
  message: string;
  suggestion: string; // Default handling (what goes into schema.yaml once approved)
}

/**
 * Find where the post-migration layout differs from .zoomdoc/schema.yaml.
 * Only directory names are judged by machine. Natural-language values such as `naming` are not interpreted (the agent reads and judges them).
 */
export function analyzeSchemaGaps(
  schema: SchemaDefinition | null,
  actions: { to: string }[],
  docsRoot = 'docs'
): SchemaGap[] {
  if (!schema?.folders) return [];
  const gaps: SchemaGap[] = [];
  const seen = new Set<string>();

  for (const { to } of actions) {
    const dir = path.posix.dirname(to);
    if (dir === docsRoot || !dir.startsWith(`${docsRoot}/`) || seen.has(dir) || schema.folders[dir])
      continue;
    seen.add(dir);
    gaps.push({
      type: 'UNAUTHORIZED_FOLDER',
      target: dir,
      message: `"${dir}" is not defined in schema.yaml (it must be added to schema.yaml to be allowed).`,
      suggestion: `Add ${dir} to folders in schema.yaml`
    });
  }
  return gaps;
}
