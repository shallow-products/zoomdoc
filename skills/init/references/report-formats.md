# Report formats

The default form of every message of `/zoomdoc:init`. Adapt it to the conversation, but keep the question first and the recommendation after the options. Write the labels in the user's language.

## Message that asks for a decision (stages 1 to 3)

```text
[Question]        One sentence: what the user is asked to decide
[Current]         One or two lines: only the facts that matter for the decision
[Options]         Numbered: label / what changes / the consequence. Changes as a tree diff
[Recommendation]  Which option and why, in one or two lines
[Next]            What happens for each answer, one line each
```

Do not put the reason inside the options. Put one decision in each message. State a default (an excluded folder, a file left in place) in the same line as the question.

## Tree diff

`+` new, `~` changed, `-` removed, a plain line unchanged. Say "no change" in one line when nothing changes.

```text
  docs/
+ ├── decisions/     new
~ ├── design/        description updated (architecture)
  └── howto/         unchanged
```

## Example (a schema already exists)

```text
[Question]  Keep the current layout, or redesign it?
[Current]   507 documents. The schema covers only docs/operations (1 file).

[Options]
1. Keep the current layout: no change. Nothing is written.
     docs/
     └── operations/   1
2. Keep it and add per-book folders: registers contents/<ID>/ in the schema.
     docs/
     └── operations/
   + contents/<ID>/    how to write knowledge.md
3. The standard layout: moves PROCEDURE.md and other files.

[Recommendation]  1, because CLAUDE.md already fixes where PROCEDURE.md and knowledge.md live.
[Next]  1: stages 3 and 4 are skipped and the lint runs. 2 or 3: the schema draft is shown for approval.
```

## Result message (stage 5)

```text
[Decided]             The layout and the other choices the user made
[Written]             What was written, as a tree diff (or "nothing written")
[Remaining problems]  Counts per kind; ask whether to leave or fix them
```
