# Contributing

Thank you for helping. Changes are made through issues and pull requests.

## Workflow

1. Open an issue first and describe what to fix or add. (A small typo fix may go straight to a pull request.)
2. One issue, one branch, one pull request, branched from the latest `main`.
3. Write `Closes #<number>` in the pull request description.
4. Commit in small, logical units.

## Development

Requires Node.js 22 or later.

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build   # dist/ is committed: rebuild after changing the source and include the diff
```

Also run `npm run lint:doc` and make sure the hooks and bundled scripts still work on Node.js 18 (`sh scripts/ci_smoke.sh`).

## Documentation

The documents in this repository follow zoomdoc's own schema (`.zoomdoc/schema.yaml`). When you add or change a document, match the schema's folders and naming rules.

## Language

Issues and pull requests may be written in English or Japanese — either is fine. The documents under `docs/` are written in Japanese; sorry for the inconvenience.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
