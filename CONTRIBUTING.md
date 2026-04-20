# Contributing to Chopsticks Lean

This is the live bot running the [Mad House](https://madebymadhouse.cloud) Discord server. Contributions are welcome — the bar is real because anything that ships here runs in production.

---

## What belongs here

- **Bug fixes** — with a clear description of what was wrong and how you verified the fix
- **Moderation improvements** — timeout durations, log formatting, permission checks
- **Voice room edge cases** — auto-delete timing, panel interactions, lobby behavior
- **Migration fixes** — backward-compatible schema changes with clear rollback paths
- **Performance fixes** — slow queries, Redis cache misses, event handler bloat
- **Lean deployment, docs, and ops cleanup**

## What does not belong here

- Music / Lavalink features — this is the lean build, intentionally stripped
- AI agent runner or pool features
- Dashboard / web surfaces
- Trading cards, casino, pets, trivia — full Chopsticks only
- Large multi-service deployment complexity

Want those features? Use the [full Chopsticks repo](https://github.com/samhcharles/chopsticks).

---

## Local setup

```bash
npm ci
cp .env.example .env
$EDITOR .env
npm run migrate
npm run verify
```

## Before opening a PR

```bash
# Syntax and migration gate (same as CI)
npm run ci:syntax
npm run ci:migrations

# If you changed a command
npm run deploy:guild

# Check for accidental secrets in staged changes
git diff --cached | grep -iE "(token|secret|password|api_key)"
```

Use `@coder` and `@reviewer` from `.github/agents/` to help write and review your changes before opening the PR.

Default workflow for Mad House repos:

https://github.com/madebymadhouse/bot-dev-playbook/blob/main/AGENTIC_GIT_WORKFLOW.md

---

## Commit format

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(commands): add /timeout-extend subcommand to moderation
fix(voice): prevent double panel spawn when bot reconnects
chore(deps): bump discord.js to 14.18.0
docs(readme): add environment variable reference table
```

The `commitlint` workflow will reject non-conforming commits. See `@git-keeper` in `.github/agents/` for the full guide.

---

## PR standards

Fill in the PR template. Three required sections:

1. **What** — what the PR does in plain language
2. **Why** — what was wrong or missing
3. **Testing** — specific steps you took to verify it

Vague descriptions ("fixed a bug", "updated stuff") will not be merged.

## What gets rejected

| Not accepted | Reason |
|---|---|
| Features from full Chopsticks | Out of scope for the lean build |
| Breaking changes to existing command APIs | Requires a discussion issue first |
| Untested migrations | Schema changes without a rollback path are too risky |
| Large refactors bundled with feature work | Split into separate PRs |
| PRs touching unrelated systems | One PR, one thing |

---

## Agent shortcuts

```
@coder           — implement a fix or feature
@debugger        — find the root cause of a broken command
@reviewer        — review your changes before opening the PR
@git-keeper      — write a proper commit message and PR description
@security        — check for auth gaps, injection surfaces, secrets
@delegator       — describe what you want done, it picks the right agents
```

