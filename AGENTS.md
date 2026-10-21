# AGENTS.md

Guidance for AI coding agents and contributors working on zoomdoc.

## Project

zoomdoc is a plugin for Claude Code and Google Antigravity: a schema (`.zoomdoc/schema.yaml`), hooks and skills. There is no server, index or database. See [README.md](./README.md) and [docs/architecture/overview.md](./docs/architecture/overview.md).

## Commands

Requires Node.js 22 or later.

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build        # dist/ is committed; rebuild after changing src/ and include the diff
npm run lint:doc     # zoomdoc's own document check
sh scripts/ci_smoke.sh   # hooks and bundled scripts on the current Node.js (also run it on Node.js 18)
```

`tests/e2e` drives a real agent and uses an access token. Run it only when asked.

## Conventions

- Documents under `docs/` follow `.zoomdoc/schema.yaml` and are written in Japanese. Everything a visitor reads first (README, community files, issue and pull request templates, changelog, this file) is in English.
- Hooks never write to the user's documents. Migration paths must stay inside the project root.
- One issue, one branch, one pull request, branched from the latest `main`. Write `Closes #<number>` in the pull request description.
- Commit in small, logical units. Finish only when lint, type check and unit tests pass.
