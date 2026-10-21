---
name: lint
description: "Statically check all documents in the repository, then investigate and fix contradictions and duplicates"
---

# /zoomdoc:lint

A repository-wide investigation that the user starts. **The agent investigates and fixes freely, using the result of the static check (a script) as the base.**

## Rules

- The static check never rewrites documents.
- Destructive operations such as deleting or moving need the target shown and the user's approval first (the procedure is in the `zoomdoc:move` skill).
- Report in the format of `references/report-formats.md`: the result first, one decision per question.

## Steps

Read the file of a step when you enter it, not before. To add a check, add a file under `references/` and a row here.

| # | Step | What happens | Read |
|---|---|---|---|
| 1 | Static check | Run the script and read its findings | [run-static-check.md](references/run-static-check.md) |
| 2 | Investigate and fix | Fix the findings; look for what a static check cannot find | [investigate-and-fix.md](references/investigate-and-fix.md) |
| 3 | Report | Tell the user what was found, fixed and left | [report-formats.md](references/report-formats.md) |
