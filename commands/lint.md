---
name: lint
description: "Statically check all documents in the repository, then investigate and fix contradictions and duplicates"
---

# /zoomdoc:lint command

A repository-wide investigation that the user starts. **The agent investigates and fixes freely, using the result of the static check (a script) as the base.**

## Procedure

### 1. Run the static check
Run it at the root of the target project. It has no options, and needs no `package.json` or `npm install` (the dependencies are bundled). The script never rewrites documents.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/doc_lint.js"
```

Exit code: `0` = pass / `1` = violations found, or not initialized (`schema.yaml` is missing; it creates nothing and only points to `/zoomdoc:init`).

What it detects (deviations from the desired state):
- Broken internal links (file existence, plus whether the `#anchor` exists as a heading; code blocks are ignored)
- `schema.yaml` syntax, the required fields of document entries (`documents`: `name`, `description`, `create`, `update`), template existence, whether the hooks can read the folders, unlisted folders and invalid nesting, and folders scattered across several roots
- Missing required front matter (`title`, `description`)
- Warnings (they do not affect pass or fail): hidden and temporary files inside the root

### 2. Investigate from the result, and fix
- Fix the reported places to match the desired state. For links, confirm the file exists before fixing.
- Look for what static checks cannot find:
  1. **Factual contradictions**: do documents disagree about design or specification?
  2. **Duplicates**: is a similar concept written in several files? (one concept = one file)
  3. **Copied code**: is something that can be read from the code written out at length?
- Destructive operations such as deleting or moving need the target shown and the user's approval first (the procedure is in the `zoomdoc:move` skill).
