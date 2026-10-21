import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

/**
 * The schema holds folder paths (keys) and, for each folder, its description and document entries (natural language).
 * Machines interpret only the paths and whether the entry fields are filled in; the values are read by people and agents.
 */
export interface DocumentEntry {
  name: string;
  description: string;
  template?: string;
  create: string;
  update: string;
  remove?: string;
}

export interface FolderConfig {
  description?: string;
  documents?: DocumentEntry[];
}

export interface SchemaDefinition {
  version?: string;
  folders: Record<string, FolderConfig>;
}

export function loadSchema(projectRoot: string): SchemaDefinition | null {
  const schemaPath = path.join(projectRoot, '.zoomdoc', 'schema.yaml');
  if (!fs.existsSync(schemaPath)) {
    return null;
  }
  try {
    return yaml.parse(fs.readFileSync(schemaPath, 'utf8')) as SchemaDefinition;
  } catch {
    return null;
  }
}

/** Extract the template paths (.zoomdoc/templates/*.md) referenced by descriptions and document entries (documents) */
export function referencedTemplates(schema: SchemaDefinition | null): string[] {
  const found = new Set<string>();
  for (const cfg of Object.values(schema?.folders ?? {})) {
    for (const m of String(cfg?.description ?? '').matchAll(/\.zoomdoc\/templates\/[\w.-]+\.md/g)) {
      found.add(m[0]);
    }
    for (const doc of cfg?.documents ?? []) {
      if (doc?.template) found.add(doc.template);
    }
  }
  return [...found];
}
