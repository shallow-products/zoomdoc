---
name: move
description: Use to move, rename or delete documents under the zoomdoc folders while keeping links consistent.
---

# Move, rename and delete (MOVE / REMOVE)

Deleting is irreversible and breaks links. Name the target and get approval first.

## Move and rename

1. Establish the source path and the destination path.
2. Check that the destination fits the folder's description and the document entry (`name`, `description`). If it does not, stop with the reason instead of acting. If the source entry's `remove` names a destination, follow it.
3. Find references to the old path:

   ```bash
   grep -rn --exclude-dir=node_modules --exclude-dir=.git "old-file-name" .
   ```

   Search the whole repository (references also come from outside the documentation root, from the README and from code comments).
4. Move with `git mv old new` in a git repository, otherwise `mv old new`.
5. Fix the links at the referencing sites and the relative links inside the moved file itself.
6. Check that `title` and `description` still fit the new location's description and the content, and fix them if not.

## Delete

1. Read the document's entry in the schema. If it has `remove`, check that its condition is met (for example "move to `docs/archive`" means move, not delete). If there is no `remove`, do not delete without approval.
   A document defined by a specific file name is not deleted on its own. If you delete it, review the schema entry too (`zoomdoc:schema`).
2. Find the references with the same `grep` as in step 3 above.
3. Show the user the target and the list of references to fix, and get approval.
4. Fix the references (remove them or point them to a replacement), then `git rm` the file.

## Check before finishing

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/doc_lint.js"
```

There must be zero errors. Any remaining broken link is also reported by the hook on the next prompt.
