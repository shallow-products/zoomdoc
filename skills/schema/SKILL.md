---
name: schema
description: Use to change the zoomdoc schema (schema.yaml), such as adding or removing a document folder, or adding or changing a document entry.
---

# Change the schema (SCHEMA)

The schema holds folder paths and document entries. Machines check only the paths and whether an entry's required fields are filled in. All values are natural language, read by people and agents.

## Format

```yaml
folders:
  docs/architecture:
    description: How the system is structured today.
    documents:
      - name: overview.md
        description: System overview, layers and how components connect.
        template: .zoomdoc/templates/overview.md
        create: When the overview is first written down.
        update: When the structure or component interaction changes.
      - name: <slug>.md
        description: One-off design notes and technical spikes.
        create: When a design is explored or a technical spike is done.
        update: Not updated (a record of that moment).
        remove: When the conclusion becomes a decision and the note has served its purpose, move it to docs/archive.
```

| Field | Required | Content |
|---|---|---|
| `name` | yes | A file name, or a naming rule in natural language. Write the conditions for easily confused rules (sequence numbers or dates) |
| `description` | yes | What the document is |
| `create` | yes | When to create a new one |
| `update` | yes | When to update it. If it is never updated, write "not updated" |
| `template` | | The full template path (`.zoomdoc/templates/…`). `zoomdoc:lint` and the hooks check that it exists |
| `remove` | | Conditions for deleting or moving. If omitted, nothing is deleted or moved without approval |

- A folder's `description` is one or two lines saying what the folder is for.
- Common writing rules (front matter, dates, subdirectories) live in `zoomdoc:write`. Put exceptions in that document's entry.
- Keep it short. The schema enters the context as is every session. Move long explanations into templates.
- A folder without `documents` still works if its `description` is written in natural language (the older style).

## Procedure

1. Say what you will change and why, and get approval (until approved, stay at a proposal).
2. Rewrite `.zoomdoc/schema.yaml`.
   - New folder: add the path and `description`. Keep the path under the existing documentation root (scattered roots trigger a warning). The folder is created when its first file is written.
   - Adding or changing a document entry: fill in every required field from the table above.
3. Check for missing fields and for template existence:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/doc_lint.js"
   ```
4. Check that existing documents in a folder whose entry changed fit the new rule. If they do not, fix them as a move or rename with `zoomdoc:move`.

After the rewrite, the hook injects the latest content again.
