# Changelog

## 0.1.0 — Initial public release (beta)

- **Schema**: `.zoomdoc/schema.yaml` declares folders and, for each folder, the documents that belong there (`name`, `description`, `create`, `update`, and optionally `template` and `remove`). Values are natural language; only folder paths are checked mechanically.
- **Hooks** (`SessionStart`, `UserPromptSubmit`): inject the schema when a session starts or the schema changes, and report broken links, missing front matter, unmanaged folders, duplicate titles and missing templates. Silent when nothing changed, and when the repository has no schema. Hooks never write to your documents.
- **Skills**: `zoomdoc:read`, `zoomdoc:write`, `zoomdoc:move`, `zoomdoc:schema` — one complete procedure per operation.
- **Commands**: `/zoomdoc:init` (deploy the schema, diagnose existing documents, reconcile them) and `/zoomdoc:lint` (static check, then the agent investigates and fixes).
- **Migration**: `scan`, `plan`, `dry-run`, `apply` and `rollback`, with link and path rewriting and a migration log. Paths are confined to the project root.
- Works with Claude Code and Google Antigravity. Zero runtime dependencies; Node.js 18 or later.
