# Security

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub: the repository's **Security** tab, then **Report a vulnerability**. A reproduction and the impact help.

## Scope

zoomdoc has no server. It runs hooks and scripts inside the user's repository. These are in scope:

- Unintended file changes or deletions (writes that were not approved)
- Access outside the user's repository
- Command execution through hooks or scripts

## Trust model

zoomdoc places the contents of `.zoomdoc/schema.yaml`, and the `title` and `description` of documents, into the agent's context — the same way a `CLAUDE.md` file is read. A repository you do not trust can therefore put instructions there. Before opening an untrusted repository with an agent, review its `.zoomdoc/schema.yaml` and documents.

Only the latest release is supported.
