---
name: read
description: Use first for any question about this project's requirements, design, decisions or procedures. Answers from the project's zoomdoc documents.
---

# Read (READ)

## Procedure

1. If `.zoomdoc/schema.yaml` does not exist, stop without searching and ask whether to initialize with `/zoomdoc:init`.
2. Read each folder's `description` and the document entries in the injected schema, and pick the folders that fit the question (more than one is fine). As a rule of thumb: "why did we do it" is a decision record, "how is it structured or how does it work" is design, "how do I use it or work on it" is a procedure, and "what are we building" is a requirement. Which folder fits which kind is decided by the schema's descriptions.
3. For each chosen folder, list only the `title` and `description` without opening the body (substitute the folder path):

   ```bash
   for f in docs/decisions/*.md; do echo "$f"; sed -n '2,/^---$/p' "$f" | grep -E '^(title|description):'; done
   ```
4. Narrow to one to three documents that fit the question. If you cannot decide, list the neighboring folders too.
5. Read only the narrowed documents. If one is long, read just the sections you need.
6. Answer from the documents and cite the paths as evidence. If the content can be checked against the code, check that they agree. If they disagree, show both and propose updating the document (`zoomdoc:write`).

## When the documents have nothing

- If there is no matching folder or document, say "the documents do not cover this", then answer from what the code shows, stating that it comes from the code. Ask whether to write it down.

## Do not

- Search outside the schema's folders with `find` or `grep`.
- Conclude from a `title` alone without reading the body.
