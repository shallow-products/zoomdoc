# Stage 5: Report the result

Read this after deployment, or after stage 2 when nothing changes.

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/doc_lint.js"
```

Report the result as counts per kind of problem. Then report, in the format of report-formats.md:

- **Decided**: the layout the user chose and any other choices.
- **Written**: what was actually written, as a tree diff, to compare with what was approved (or "nothing written").
- **Remaining problems**: the problems left. Do not fix them without asking; ask whether to leave them or fix them. The hooks keep reporting what is left.
