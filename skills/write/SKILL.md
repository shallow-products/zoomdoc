---
name: write
description: Use to record or update project documentation (decisions, specs, guides) under the zoomdoc folders, e.g. after a design decision or a new feature.
---

# Write (WRITE: create and update)

## Common writing rules

If the schema's document entry (or the folder description) says otherwise, follow it. If it says nothing, use these:

- Start with front matter containing `title` and `description` (a one- or two-line summary).
- Do not write dates (they come from git history).
- Put files directly in the folder; do not create subdirectories or folders the schema does not list.
- One concept per file. Write only the current correct state, not its history, and do not write what can be read from the code.

## Procedure

1. If `.zoomdoc/schema.yaml` does not exist, stop without writing and ask whether to initialize with `/zoomdoc:init`.
2. Decide in a few words what to write (for example "why we chose the auth method" or "deploy procedure").
3. From the injected schema, choose the location and document using each folder's `description` and the document entries (`name`, `description`, `create`, `update`). Which folder fits a decision record, a developer procedure or an operations procedure is decided by the schema's descriptions.
   - If no entry fits, do not create a folder or entry; propose adding a definition and wait for instructions (`zoomdoc:schema`).
   - If a description or entry says "confirm first", confirm with the user before writing.
4. Read the entry's `name` and decide between creating and updating.
   - If `name` is a specific file name, use that file (create it under the `create` condition if it does not exist). Do not create it under another name.
   - If `name` is a rule (such as `<slug>` or a date format), go to step 5.
   - When a specific-name entry and a rule entry overlap, the specific-name entry wins.
5. For rule-named documents, list the folder's `title` and `description` lines; if a document covers the same concern, update it. Otherwise create a new one.

   ```bash
   for f in docs/decisions/*.md; do echo "$f"; sed -n '2,/^---$/p' "$f" | grep -E '^(title|description):'; done
   ```

   If the folder does not exist, no listing is needed and you may create it. But if that document's `update` says "not updated", do not append; create a new one.
6. For a new document, choose the name by the `name` rule (ask the user if unsure). If the entry has a `template`, read it before writing. For an update, rewrite the relevant sections to the current correct content.
7. Make the front matter's `title` and `description` match the content.

## Check before finishing

- The location matches the entry's `description`.
- No document on the same concern sits beside it under another name.
- Links to other documents point to paths that exist.

For moving, renaming and deleting, use `zoomdoc:move`.
