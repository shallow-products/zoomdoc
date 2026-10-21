# Skill walkthrough (manual)

How to check that a real Claude Code can run `/zoomdoc:init` and each skill end to end. A person watches what the agent does; **`check.js` decides pass or fail by machine**.

- Create throwaway samples **outside this repository**. Inside it, the parent `CLAUDE.md` and schema get picked up and pollute the result.
- Run the scripts through `docker compose run`. Only starting Claude Code itself happens on the host.
- The prompts below are written in Japanese on purpose: they are the exact inputs the E2E uses.

## Preparation

```bash
export WT="$HOME/zoomdoc-walkthrough"
RUN='docker compose run --rm -v '"$WT"':/walkthrough zoomdoc-dev node'
```

Create a sample per scenario (recreating one discards the previous result):

```bash
$RUN tests/walkthrough/setup.js store /walkthrough/store               # recording documents
$RUN tests/walkthrough/setup.js migrate /walkthrough/migrate           # migration (root: docs)
$RUN tests/walkthrough/setup.js migrate-root /walkthrough/migrate-root # migration (renamed root)
```

## Running

In the sample directory, start Claude Code with the plugin:

```bash
cd "$WT/store"        # likewise for the other scenarios
claude --plugin-dir <path to your zoomdoc checkout>
```

Judge the result (this never modifies the sample):

```bash
$RUN tests/walkthrough/check.js store /walkthrough/store
```

## Scenarios

### 1. Recording documents (`store`) — initialized, with no document folder yet

Enter these prompts one at a time:

1. `SQLite を採用することにした。依存を増やさず1ファイルで配れるのが理由。決定記録（ADR）を残して。`
2. `開発環境のセットアップ手順を、ガイドとして書いて。npm install と docker compose up だけでいい。`

Expected: `docs/decisions/` and `docs/guides/` are created, and each document has front matter with only `title` and `description`. The schema does not change.

Approve any confirmation the agent asks for.

### 2. Init and migration (`migrate`) — 25 legacy documents, root `docs`

1. Prompt: `/zoomdoc:init`
2. When asked for the documentation folder: **leave it empty** (the standard `docs/`)
3. When asked about the plan: follow the recommendation (C)
4. Review the `dry-run` list and approve

### 3. Init and migration (`migrate-root`) — renamed root

1. Prompt: `/zoomdoc:init`
2. When asked for the documentation folder: **`documentation`**
3. Continue as in scenario 2

## What to observe and record (the parts a check cannot judge)

- Was each question asked only once (root, plan)? Did confirmations chain?
- Did the agent deploy the base with `init.js` before migrating?
- Did it use `migrate.js` for moves, front matter and link rewrites, instead of writing its own scripts?
- Did it avoid rewriting `schema.yaml` before approval?
- Did the hook notices appear? Were they in the "desired state, current state" form, and fixable?
- Where it stumbled or hesitated (clues for improving the skill text)

## Recording the result

Keep the output of `check.js` and the observations above, with the date, commit, agent and model (follow "3. How to measure and record" in `docs/evaluation/benchmark.md`).

## Foundation for automatic runs (Claude Code in a container)

The automatic E2E runs `claude` inside the `zoomdoc-e2e` service. `zoomdoc-dev` does not include `claude`.

1. Issue a token (once, interactively, on the host): `claude setup-token`. Write the printed token to a **file outside the repository**. Do this **in your own terminal**, and never paste it into a chat or anywhere that is shared or logged:
   ```bash
   mkdir -p ~/.config/zoomdoc
   (umask 077; printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' '<the issued token>' > ~/.config/zoomdoc/e2e.env)
   ```
   To keep it elsewhere, point the environment variable `ZOOMDOC_E2E_ENV_FILE` at the file. The token is valid for a year. If it leaks, revoke it in the claude.ai settings.
2. Smoke test (create a sample, load the plugin and call it once):
   ```bash
   docker compose run --rm zoomdoc-e2e sh -c '
     node tests/walkthrough/setup.js store /walkthrough/store &&
     cd /walkthrough/store &&
     claude -p "zoomdoc のスキルを使って、docs/ にある文書を探して。何があるか教えて" \
       --plugin-dir /app --output-format json'
   ```
   Without authentication you get `Not logged in`. The write permission bypass (`--dangerously-skip-permissions`) is used only inside the sample. The container runs as the `node` user, because that flag does not work as root.

## Automatic runs (a scenario N times)

Instead of the manual steps, `tests/e2e/run.js` runs the scenarios in `tests/e2e/scenarios.js` N times (default 3) with a real agent and judges them with `check.js`. It is not part of CI; run it before a release and when the design changes.

```bash
docker compose run --rm zoomdoc-e2e node tests/e2e/run.js            # every scenario x 3
docker compose run --rm zoomdoc-e2e node tests/e2e/run.js store --n 1  # one scenario, once
```

- A conversation continues turn by turn with `claude -p --resume`. Answers to the agent's questions are in the scenario's `turns`.
- Output goes to `~/zoomdoc-walkthrough/e2e/<run id>/` (outside the repository): `report.md` (pass rate, metrics, failed checks, a row to add to benchmark.md), `summary.json`, and for each run `transcript.jsonl` (tool calls, hook notices, tokens, duration) and `sandbox/`.
- Metrics: number of tool calls, use of `grep`/`find`, hand-written scripts, use of `init.js`/`migrate.js`, tokens, cost, duration.
- Where `claude` is unavailable, the run fails (exit code 2) instead of skipping.
- Judge by pass rate, not a single run. For a failure, read `transcript.jsonl` for the cause and fix the skill or its wording.
