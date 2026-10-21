export interface LinkIssue {
  kind: 'file' | 'anchor';
  line: number;
  label: string;
  target: string;
}
export function githubSlug(heading: string): string;
export function collectAnchors(content: string): Set<string>;
export function checkMarkdownLinks(
  projectRoot: string,
  filePath: string,
  content: string
): LinkIssue[];
