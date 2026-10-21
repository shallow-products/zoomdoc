# Snippet to add to .zoomdoc/schema.yaml

How to add a new folder to `.zoomdoc/schema.yaml`: write the folder path, its description and the document entries. Every value is natural language.

```yaml
folders:
  docs/experiments:
    description: Records of technical spikes and proofs of concept.
    documents:
      - name: YYYY-MM-DD-<slug>.md (one experiment per file)
        description: The purpose, method and result of an experiment.
        template: .zoomdoc/templates/architecture-spike.md
        create: When a new prototype or technology choice has been tried out.
        update: Not updated (a record of that moment).

  docs/security:
    description: Security policy and audit records. Confirm with the user before writing.
    documents:
      - name: policy.md
        description: The basic policy.
        create: When the policy is set.
        update: When the policy is revised.
      - name: audit.md
        description: Audit records.
        create: When the first audit is done.
        update: When a periodic audit is done (append to it).
        remove: Never delete.
```

- `name`, `description`, `create` and `update` are required. `template` (the full path) and `remove` are optional.
- For a document that is never updated, write "not updated" in `update`.
- Do not write the common rules (front matter, dates, subdirectories). `zoomdoc:write` holds them.
