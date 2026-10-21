import fs from 'node:fs';
import path from 'node:path';

/**
 * Root Anchor Finding:
 * 1. Find .zoomdoc directory by traversing up from cwd.
 * 2. If not found, find .git directory by traversing up from cwd.
 * 3. If neither found, fallback to cwd.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  const current = path.resolve(startDir);
  const root = path.parse(current).root;
  const markers = ['.zoomdoc', '.git'];

  for (const marker of markers) {
    let dir = current;
    while (true) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir;
      }
      if (dir === root) break;
      dir = path.dirname(dir);
    }
  }

  return current;
}
