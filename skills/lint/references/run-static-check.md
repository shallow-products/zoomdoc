# Step 1: Run the static check

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
