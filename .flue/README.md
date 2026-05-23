# Flue triage experiment

**Status:** prototype, not deployed. See the EmDash Discussion for design context (TBD link).

This directory contains an experimental Flue-based triage system with two phases:

## Phase 1: Worker-deployed auto-labeller

A Cloudflare Worker that receives `issues.opened` webhooks from GitHub, classifies the issue with Workers AI (kimi-k2.6) routed through our AI Gateway, and posts a labeling comment.

- `agents/triage-label.ts` — HTTP webhook handler. Verifies HMAC against raw bytes, parses, classifies, applies labels. Prompt is inlined (the default Cloudflare sandbox has no filesystem for skills).
- `agents/triage-issue.ts` — CLI-only entrypoint. Same classification, no webhook. Used by the local prototype runner and by Phase 2.
- `app.ts` — boot-time wiring of the Workers AI binding through our AI Gateway.
- `lib/github.ts` — Octokit wrapper.
- `lib/verify-signature.ts` — HMAC-SHA256 verification using Web Crypto.

## Phase 2: GH-Actions-driven reproduction attempt

When a maintainer adds the `triage:reproduce` label to an issue, the `.github/workflows/auto-repro.yml` workflow fires, checks the repo out, and runs the `repro-issue` agent with `sandbox: local()` — real bash, real `pnpm`, real `gh`. The agent tries to write a failing test or repro script and posts the result.

It does NOT push branches, commit anything, or attempt fixes.

- `agents/repro-issue.ts` — CLI-only agent.
- `<repo-root>/.agents/skills/reproduce/SKILL.md` — the reproduce prompt. Lives alongside our existing skills so Flue's `local()` sandbox finds it via the standard `.agents/skills/<name>/SKILL.md` lookup.

## Local prototyping

All model traffic routes through our Cloudflare AI Gateway, same path `/bonk` and `/review` take. Required env (mirroring the workflow secrets `CF_AI_GATEWAY_*`):

```bash
export CLOUDFLARE_ACCOUNT_ID=<account uuid>
export CLOUDFLARE_GATEWAY_ID=<gateway slug>
export CLOUDFLARE_API_TOKEN=<gateway-scoped token>

cd .flue
pnpm install --ignore-workspace

# Test against a saved fixture (under .flue/fixtures/)
pnpm prototype 1021

# Or against a live issue
pnpm prototype --live 1083

# Or post the result to GitHub (only if you really mean it)
GITHUB_TOKEN=... pnpm prototype --apply --live 1083

# Try a different model
FLUE_TRIAGE_MODEL=cloudflare-ai-gateway/claude-opus-4-7 pnpm prototype 1021
```

The runner spawns `flue run triage-issue` with the issue payload and prints the structured triage, the labels that would be applied, and the rendered comment body. Defaults to `cloudflare-ai-gateway/workers-ai/@cf/moonshotai/kimi-k2.6` (the same kimi model the deployed Worker uses).

## Why two phases

Phase 1 is cheap (~$0 per issue on Workers AI), fast (~5s end-to-end), and conservative (label + comment only). It runs on every new issue.

Phase 2 is expensive (Opus on a 30-min runner), slow, and powerful (real shell, can write tests). It runs only on explicit maintainer opt-in. The split prevents bot rate-limit churn and bounds the blast radius of agent mistakes.

## Threat model (Phase 2)

The repro agent feeds attacker-controlled issue bodies into a prompt context with a `bash`-equipped sandbox and `GH_TOKEN` in env. Anyone can file an issue. The agent's "do not commit, do not push, do not curl arbitrary URLs" guardrails are **prompt-level only** -- a sufficiently clever issue body can argue them away.

What blocks real abuse:

1. **Maintainer label gate.** The workflow fires on `issues.labeled` with `label.name == 'triage:reproduce'`. A maintainer (with `issues:write`) has to apply that label before the agent ever sees the issue body. **This is the actual security boundary.** Don't apply `triage:reproduce` to an issue you wouldn't drop a fresh Opus into.
2. **`contents: read` on the runner.** The workflow grants `contents: read`, so even a jailbroken agent can't push branches via `git push`. `GH_TOKEN` permissions are the floor; the agent never gets more than the workflow grants.
3. **No third-party network in shell.** The `reproduce` skill explicitly forbids `curl`/`wget` against arbitrary URLs. Reading skills can override this; trust depends on (1).

What a successful jailbreak _can_ do with the default token:

- Comment on any issue / PR in the repo (the token has `issues: write`)
- Apply / remove labels
- Close issues

A finer-grained PAT or a GitHub App installation token scoped to a single issue would mitigate this further. Worth doing before turning the workflow on broadly. Tracked in the Discussion for this PR.
