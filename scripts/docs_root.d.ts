export const DEFAULT_DOCS_ROOT: string;
export function normalizeDocsRoot(input: unknown): string;
export function matchFolderKey(line: string): string | null;
export function scanSchemaFolders(
  yamlText: string,
  handlers: { onFolder?: (path: string) => void; onLine?: (line: string, path: string) => void }
): void;
export function parseSchemaFolderKeys(yamlText: string): string[];
export function deriveDocsRoot(folderKeys: string[]): string | null;
export function findMultipleRoots(folderKeys: string[]): string[];
export function getDocsRoot(projectRoot: string): string;
export function rebaseSchemaText(text: string, docsRoot: string): string;
