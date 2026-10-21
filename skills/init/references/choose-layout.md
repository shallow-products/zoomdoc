# Stage 2: Choose a layout

Read this after the survey. The dialogue is mandatory, even when the project has no documents. Nothing is written.

Offer three options, each as a directory tree in the same format:

1. **Recommended layout**: zoomdoc's standard. Show it with
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" layout [--docs-root <path>]
   ```
2. **The user's own layout**: ask which folders they want and what each is for, then show the result as a tree.
3. **Keep the current layout**: build a tree from the folders found in the survey, each with the existing count and a one-line description of what it holds.

With an existing schema the question is "keep it, or redesign it?"; show, for each option, how the schema's folders would change (a preview).

After the options, give the recommendation and its reason (few documents or a mess: the recommended layout; many documents with an established practice: keep the current one), and wait for the choice.

- If the chosen option leaves the schema unchanged, say that nothing will be written, skip stages 3 and 4 and go to stage 5.
- If the project is a monorepo or has several documentation roots, ask which root this schema covers.

Format: the full structure (see report-formats.md).
