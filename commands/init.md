---
name: init
description: "Adopt zoomdoc in a project: survey, choose a layout, fix the schema with the user, then deploy"
---

# /zoomdoc:init command

Adopts `zoomdoc` in a project that usually already has documents. **The layout is decided first, through a dialogue that is never skipped, and the schema is written only after the user approves it.** This holds even when the project has no documents yet.

## Rules for every stage

- **Never decide silently.** Say what you will do and why before each step, including when you follow your own recommendation. Treat every choice as the user's choice and repeat it back.
- **Write nothing before the schema is approved.** Stages 0 to 3 only read.
- Every stage is safe to run again. If a stage was already done, say so and ask whether to redo it.

## How to write each message

The user must see, within the first lines, what you are asking and what will change. Do not make them read a report to find the question.

1. **Open with the question**, in one sentence, before any detail. Example: "Keep the current layout or redesign it?" Put background after it.
2. **One decision per message.** Facts that need no decision (git is clean, no monorepo) go in one line, or are left out. State a default (an excluded folder, a file left in place) in the same line as the question, not as a separate question.
3. **Show current and after side by side.** For every option, show the change as a tree with `+` new, `~` changed, `-` removed and a plain line unchanged, or say "no change" in one line. Never describe a change only in words.
4. **Options are short**: a label, what changes (one line), the consequence (one line). Do not put the reason inside the options. After the last option, write the recommendation and its reason ("Recommended: 1, because ...") in one or two lines.
5. **Say what happens next** for each answer in one line (for example: "Choosing 1 changes nothing, so stages 3 and 4 are skipped").
6. Show layouts as directory trees in a code block, one description line per folder, with the existing document count where there is one. Show all options in the same format.

| Stage | What happens | The user |
|---|---|---|
| 0. Preflight | Check git, an existing schema, monorepo signals | Is told |
| 1. Survey | List the existing documents | Reviews the list |
| 2. Choose a layout | Recommended / the user's own / keep the current one | **Must choose** |
| 3. Fix the schema | Draft the schema, show the tree diff | **Must approve** |
| 4. Deploy | Place the schema and templates; migrate if needed | Approves |
| 5. Finish | Diagnose again and report | Is told |

## 0. Preflight and 1. Survey

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" survey
```

It writes nothing. It reports the git state (branch, uncommitted changes), whether `.zoomdoc/schema.yaml` already exists, monorepo signals, and where the documents are (a tree with counts; generated and tool-owned folders and standard files such as `README.md` are listed apart). Show the result to the user and say plainly:

- Report the preflight in one line. Raise it as a question only if it blocks something: uncommitted changes (ask for a clean tree or a dedicated branch before stage 4).
- If a schema already exists, this is the edge case: the question of stage 2 becomes "keep the schema as it is, or redesign it?". Show what the schema covers now and what each option would change. Never overwrite it without approval.
- Folders that look user-designed (a deliberate structure, ADRs, specifications) stay where they are by default; say so in one line. Ask only about the ones you are unsure of. Folders that are generated or external are excluded; list them in the same line.

## 2. Choose a layout (mandatory)

Ask even when there are no documents. Offer three options, each as a directory tree:

1. **Recommended layout**: zoomdoc's standard. Show it with
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" layout [--docs-root <path>]
   ```
2. **The user's own layout**: ask which folders they want and what each is for, then show the result as a tree.
3. **Keep the current layout**: build a tree from the folders found in stage 1, each with the existing count and a one-line description of what it holds.

Give a recommendation and the reason (few documents or a mess: the recommended layout; many documents with an established practice: keep the current one), and wait for the user's choice. If the chosen option leaves the schema unchanged, say that nothing will be written, skip stages 3 and 4 and go to stage 5. If the project is a monorepo or has several documentation roots, ask which root this schema covers.

## 3. Fix the schema (mandatory approval)

Draft `schema.yaml` for the chosen layout, following the `zoomdoc:schema` skill (folders, descriptions, document entries). Save the draft outside the project (for example a temporary file) and show:

1. The layout as a tree.
2. A before and after tree diff when a schema or folders already exist (`+` new, `~` description changed, a plain line unchanged).
3. What each folder's description will tell the agent to do.

Ask for approval. If the user asks for changes, redraft and show again. Do not go on without an explicit yes.

## 4. Deploy

Tell the user which files will be created, then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" --schema-file <approved-schema.yaml>
```

It places the approved schema and the templates. Existing files are never overwritten and no documentation folder is created (it is created when the first file is written). It refuses a schema without folders.

If the chosen layout needs the existing documents moved, ask whether to move them now, and follow the "Migration protocol" below. Migrating is optional: keeping the current layout needs no move.

## 5. Finish

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/doc_lint.js"
```

Report the result as counts per kind of problem, and say what was decided and what was written during this run (the layout chosen, the schema, any moves). If problems remain, say they are left as they are and the hooks will keep reporting them.

## Migration protocol (when the user chooses to move documents in stage 4)

If there are about 30 or more targets, confirm with the user before scanning.
> "There are **N** targets. Scanning with subagents **consumes a lot of tokens**. Continue? To stop, organize by hand or change the schema to fit the documents."

Each stage is `node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" <subcommand>` (run at the project root; `--json`, `--root <dir>`, `--docs-root <dir>`). Run it without arguments to see the usage. Do not write the moving, front matter, reference rewriting or logging yourself. The agent's job is only the judgment of summarizing and classifying.

### 1. Scan (`scan`)
```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/migrate.js" scan --chunks <number of subagents> [--ext md,txt,yaml,json,adoc,rst] [--strategy <name>]
```
It returns each file's excerpt, a size diagnosis (`safety`) and a recommended strategy (`recommendedStrategy`) as JSON. The default is `head30-tail10`; above 80 files `pct20-10` is recommended (the basis is in [scan-strategy-experiment.md](../docs/architecture/scan-strategy-experiment.md)). Assign each of the `chunks` to a subagent, have it produce a summary and a classification (`category`: `product` / `architecture` / `decisions` / `guides` / `conventions` / `operations` / `references` / `archive`), aggregate them and save them as `extracted.json`:
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
