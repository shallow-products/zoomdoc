# Stage 1: Survey the project

Read this at the start. Nothing is written in this stage.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.js" survey
```

It reports the git state (branch, uncommitted changes), whether `.zoomdoc/schema.yaml` exists, monorepo signals, and where the documents are (a tree with counts; generated and tool-owned folders and standard files such as `README.md` are listed apart).

## What to tell the user

- Report the preflight in one line. Raise it as a question only if it blocks something: uncommitted changes (ask for a clean tree or a dedicated branch before stage 4).
- If a schema already exists, this is the edge case: the question of stage 2 becomes "keep the schema as it is, or redesign it?". Show what the schema covers now and what each option would change. Never overwrite it without approval.
- Folders that look user-designed (a deliberate structure, ADRs, specifications) stay where they are by default; say so in one line. Ask only about the ones you are unsure of. Generated or external folders are excluded; list them in the same line.

Stage 1 needs no decision unless one of the above applies: give the current state in one or two lines and go on to stage 2.

Format: [Current] only, or the full structure when a question is raised (see report-formats.md).
