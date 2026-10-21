---
name: init
description: "Adopt zoomdoc in a project: survey, choose a layout, fix the schema with the user, then deploy"
---

# /zoomdoc:init

Adopts `zoomdoc` in a project that usually already has documents. **The layout is decided first, through a dialogue that is never skipped, and the schema is written only after the user approves it.** This holds even when the project has no documents yet.

## Rules

- **Never decide silently.** Say what you will do and why before each step, including when you follow your own recommendation. Treat every choice as the user's choice and repeat it back.
- **Write nothing before the schema is approved.** Stages 1 to 3 only read.
- **Open with the question**, one decision per message, changes as a tree diff, the recommendation and its reason after the options. The format is in `references/report-formats.md`.
- Every stage is safe to run again. If a stage was already done, say so and ask whether to redo it.

## Stages

Read the file of a stage when you enter it, not before.

| # | Stage | What happens | The user | Read |
|---|---|---|---|---|
| 1 | Survey | Check git, an existing schema, monorepo signals; list the documents | Is told | [survey-project.md](references/survey-project.md) |
| 2 | Layout | Recommended / the user's own / keep the current one | **Must choose** | [choose-layout.md](references/choose-layout.md) |
| 3 | Schema | Draft the schema, show the tree diff | **Must approve** | [approve-schema.md](references/approve-schema.md) |
| 4 | Deploy | Place the schema and templates; migrate if needed | Approves | [deploy-and-migrate.md](references/deploy-and-migrate.md) |
| 5 | Report | Diagnose again; report what was decided and written | Is told | [report-result.md](references/report-result.md) |

If the layout chosen in stage 2 leaves the schema unchanged, skip stages 3 and 4.

## Before and after

Show the before and after as a tree diff at these points, and nowhere else:

| When | What the diff shows |
|---|---|
| Stage 2, in the options | For each option, how the schema's folders would change (a preview) |
| Stage 3, before asking for approval | The exact change to `schema.yaml` (the one that will be written) |
| Stage 4, before moving documents | The `dry-run` list of moves, in the same `+ ~ -` form |
| Stage 5, in what was written | What was actually written, to compare with what was approved |
