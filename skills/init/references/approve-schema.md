# Stage 3: Approve the schema

Read this after a layout is chosen and it changes the schema. Nothing is written before approval.

Draft `schema.yaml` for the chosen layout, following the `zoomdoc:schema` skill (folders, descriptions, document entries). Save the draft outside the project (for example in a temporary file) and show:

1. The layout as a tree.
2. The exact change as a before-and-after tree diff when a schema or folders already exist (`+` new, `~` description changed, `-` removed, a plain line unchanged). This is the change that will be written.
3. What each folder's description will tell the agent to do.

Ask for approval. If the user asks for changes, redraft and show again. Do not go on without an explicit yes.

Format: the full structure (see report-formats.md).
