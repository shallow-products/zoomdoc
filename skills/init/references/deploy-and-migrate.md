# Stage 4: Deploy and migrate

Read this when stage 3 is approved (or skipped because nothing changes).

## Deploy

Tell the user which files will be created, then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" --schema-file <approved-schema.yaml>
```

It places the approved schema and the templates. Existing files are never overwritten, and no documentation folder is created (it is created when the first file is written). It refuses a schema without `folders`.

## Migrate (only if the chosen layout moves documents)

Ask whether to move the documents now. Moving is optional; keeping the current layout needs no move. Before moving anything, show the `dry-run` list in the before-and-after form (`+ ~ -`), then ask for approval. Follow the protocol below.

## Migration protocol

If there are about 30 or more targets, confirm with the user before scanning.
> "There are **N** targets. Scanning with subagents **consumes a lot of tokens**. Continue? To stop, organize by hand or change the schema to fit the documents."

Each stage is `node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" <subcommand>` (run at the project root; `--json`, `--root <dir>`, `--docs-root <dir>`). Run it without arguments to see the usage. Do not write the moving, front matter, reference rewriting or logging yourself. The agent's job is only the judgment of summarizing and classifying.

### 1. Scan (`scan`)
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" scan --chunks <number of subagents> [--ext md,txt,yaml,json,adoc,rst] [--strategy <name>]
```
It returns each file's excerpt, a size diagnosis (`safety`) and a recommended strategy (`recommendedStrategy`) as JSON. The default is `head30-tail10`; above 80 files `pct20-10` is recommended (the basis is in [scan-strategy-experiment.md](../../../docs/architecture/scan-strategy-experiment.md)). Assign each of the `chunks` to a subagent, have it produce a summary and a classification (`category`: `product` / `architecture` / `decisions` / `guides` / `conventions` / `operations` / `references` / `archive`), aggregate them and save them as `extracted.json`:
```json
[{ "path": "docs/legacy/login.md", "title": "JWT authentication flow specification", "summary": "Specification of the authentication flow using JWT and the lifetime of refresh tokens", "category": "architecture" }]
```

### 2. Present the plan (`plan`)
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" plan --extracted extracted.json
```
It returns a `recommendation` (the recommended option and the reason), options A / B / C, and `schemaGaps` (folders missing from `schema.yaml` and the default handling) as JSON. Conflicting destinations are reported as errors here.

**Confirm with the user once, at this point.** Show all of the following together and ask whether to proceed with the defaults:
1. The recommended option and the reason (C if there is something to archive, otherwise B)
2. The difference between the three options
   - **A**: relocate every file to `<root>/<category>/`
   - **B**: do not move paths; only add front matter
   - **C**: live documents go to the standard folders (left in place if already there), and `archive`-classified ones are moved to `<root>/archive/`
3. `schemaGaps` and the default handling. The agent reads the schema to check whether each folder's description (naming rules and so on) fits the layout after migration, and proposes changes if it does not

Only after the user approves an option may `schema.yaml` be rewritten (after approval, add folders if needed and rewrite folder descriptions to match the existing practice). Save the chosen option with `plan --extracted extracted.json --type a|b|c --out plan.json`.

### 3. Confirm before approval (`dry-run`)
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" dry-run --plan plan.json
```
It changes nothing and lists the move sources and destinations, the front matter to be added, the references to be rewritten, and the links that were already broken before applying. Show it to the user and get approval.

### 4. Apply (`apply`)
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" apply --plan plan.json
```
Run it only after approval. The following happens in one go:
1. Moving and adding front matter (`title`, and `description` = the summary). No dates are written.
2. Rewriting references that follow the moves (relative links, anchors, `docs/…` path strings, code comments; external URLs and code blocks are excluded) and checking for broken links.
3. Writing `.zoomdoc/migration-log.json` (a before-and-after table of the moves), with or without git.

### 5. Verify
Confirm that `node "${CLAUDE_PLUGIN_ROOT}/dist/doc_lint.js"` passes with zero errors. `log` shows the history, and if something is wrong, `rollback` restores the original layout (references included).
