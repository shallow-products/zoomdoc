export interface UnmanagedFolder {
  dir: string;
  files: string[];
}
export function collectMarkdown(dir: string, out?: string[]): string[];
export function findStructureIssues(
  projectRoot: string,
  docsRoot: string,
  folderKeys: string[],
  options?: { includeEmpty?: boolean }
): { unmanaged: UnmanagedFolder[]; nested: string[] };
export function findDuplicateTitles(
  items: { path: string; folder: string; title?: string }[]
): { folder: string; title: string; paths: string[] }[];
export function findMissingTemplates(
  projectRoot: string,
  schemaText: string
): { folder: string; template: string }[];
