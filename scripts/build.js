import * as esbuild from 'esbuild';

const banner = `import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import nodePath from 'node:path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);`;

const common = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  packages: 'bundle',
  banner: { js: `#!/usr/bin/env node\n${banner}` }
};

// Bundle zoomdoc:lint and the migration into single files so they run in projects without a package.json
await esbuild.build({
  ...common,
  entryPoints: ['scripts/doc_lint.js'],
  // The entry scripts carry their own shebang, so the banner does not add one
  banner: { js: banner },
  outfile: 'dist/doc_lint.js'
});
await esbuild.build({
  ...common,
  entryPoints: ['scripts/migrate.js'],
  banner: { js: banner },
  outfile: 'dist/migrate.js'
});
