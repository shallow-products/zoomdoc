# zoomdoc

[日本語](./i18n/ja/README.md)

**Keep your project's documentation findable, current, and consistent — for AI coding agents.**

zoomdoc is a plugin for [Claude Code](https://claude.com/claude-code) and Google Antigravity. You describe where each kind of document lives and when to write or update it in one small `schema.yaml`. Hooks give that schema to the agent at the start of every session and flag drift as it happens; skills give the agent a complete procedure for reading, writing and moving documents.

No server, no index, no database. The files on disk are the source of truth.

## Highlights

- **Read less, answer better.** The agent starts from the schema and a list of `title` and `description` lines, then opens only the documents it needs — instead of running `grep` and `find` over the whole tree.
- **Docs that do not rot.** Each document entry says when it is created, when it is updated, and when it may be removed. Duplicate titles, broken links and missing front matter are detected and reported.
- **Never in the way.** Hooks only notify; they never block, and they never touch your documents. When nothing changed, they cost zero tokens (about 30–50 ms of runtime for 10–1,000 documents, see [benchmark](./docs/evaluation/benchmark.md)).
- **Plain natural language.** Only folder paths are checked mechanically. Naming rules, templates and update conditions are written in prose that the agent reads and follows.
- **Zero dependencies.** Hooks and scripts run on Node.js 18+ with no `npm install`.

## How it works

| Part | What it is | What it does |
| :--- | :--- | :--- |
| **Schema** | `.zoomdoc/schema.yaml`, `.zoomdoc/templates/` | Declares the folders and, for each folder, the documents that belong there: name, description, template, when to create, when to update, when to remove. |
| **Hooks** | `SessionStart`, `UserPromptSubmit` | Inject the schema verbatim when a session starts or the schema changes, and report broken links, missing front matter, unmanaged folders and duplicate titles. Silent when the repository has no schema. |
| **Skills** | `zoomdoc:read` `zoomdoc:write` `zoomdoc:move` `zoomdoc:schema` | One complete procedure per operation: answer from the docs with sources, record a decision in the right place, move or delete with links kept intact, or change the schema. |

## Installation

Requires Node.js 18 or later.

```bash
claude plugin marketplace add shallow-products/zoomdoc
claude plugin install zoomdoc@zoomdoc
```

A plugin installed with the *local* scope is active only in that project. Install it with the *user* scope to use it everywhere. Antigravity uses the root `plugin.json` and `hooks.json`.

## Quick start

In the repository you want to manage, run:

```text
/zoomdoc:init
```

`init` works in three independent stages, and is safe to run again:

1. **Deploy** — puts `.zoomdoc/schema.yaml` and the templates in place. Existing files are never overwritten.
2. **Diagnose** — checks existing documents and reports counts by kind of problem.
3. **Reconcile** — if there are problems, you choose: move the documents to fit the schema (a reviewed, reversible migration), change the schema to fit the documents, or do nothing.

From then on, just work. The agent sees the schema at session start, uses `zoomdoc:read` to answer questions from your documents, and `zoomdoc:write` to record decisions and specs. `/zoomdoc:lint` runs a full static check on demand.

## A schema in 20 lines

```yaml
folders:
  docs/decisions:
    description: Why we decided what we decided. One architecture decision record per file.
    documents:
      - name: YYYY-MM-DD-<slug>.md
        description: One decision, its reasons and alternatives.
        template: .zoomdoc/templates/adr.md
        create: When a library, database or major design direction is chosen.
        update: Not updated. If the decision changes, write a new one instead.
  docs/architecture:
    description: How the system is structured today.
    documents:
      - name: overview.md
        description: System overview, layers and how components connect.
        create: When the overview is first written down.
        update: When the structure or component interaction changes.
```

`name`, `description`, `create` and `update` are required for every document entry; `template` and `remove` are optional. All values are natural language. See [Schema governance](./docs/architecture/schema-governance.md) for the full design.

## Commands and skills

| Invocation | Purpose |
| :--- | :--- |
| `/zoomdoc:init` | Deploy the schema, diagnose existing documents, reconcile them |
| `/zoomdoc:lint` | Static check, then the agent investigates and fixes contradictions and duplicates |
| `zoomdoc:read` · `write` · `move` · `schema` | Procedures the agent picks automatically |

## What zoomdoc will and will not change

- With no `.zoomdoc/schema.yaml`, the hooks do nothing at all.
- Hooks and `/zoomdoc:lint` never rewrite your documents. They detect and report; fixing is the agent's job, under your supervision.
- The only automated writes are an approved migration: you review a dry run first, every move is logged in `.zoomdoc/migration-log.json`, and `rollback` restores the previous layout. Migration paths are confined to the project root.

## Configuration

- **Disable hooks:** set `ZOOMDOC_DISABLE_HOOKS=all` (or `detect-issues`, `sync-triggers`, comma-separated), or put `{"hooks": {"detect-issues": false}}` in `.zoomdoc/config.json`.
- **Re-notification:** an unfixed problem is reported again after 10 silent prompts. Change it with `{"hooks": {"renotifyEvery": 20}}` (`0` to never repeat).
- **Keep the schema focused.** It is placed in the agent's context every session, so a longer schema costs tokens and makes details easier to miss. Move long explanations into templates.

## Learn more

- [Overview](./docs/architecture/overview.md) and [tech stack](./docs/architecture/tech-stack.md)
- [Why hooks do not use PostToolUse](./docs/decisions/2026-10-10-drop-posttooluse.md) and [why there is no MCP server](./docs/decisions/2026-10-09-schema-direct-no-mcp.md)
- [Evaluation and benchmarks](./docs/evaluation/benchmark.md)
- [Changelog](./CHANGELOG.md)

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md). This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE)
