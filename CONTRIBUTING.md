# Contributing to chopsticks-lean

This repo is intentionally narrow in scope. Contributions should preserve that.

## What belongs here

- Moderation improvements
- Core server tooling
- VoiceMaster fixes and improvements
- Custom VC fixes and improvements
- Lean deployment, docs, and ops cleanup
- PostgreSQL/Redis runtime reliability

## What does not belong here

- Music/Lavalink features
- Agent runner or pool features
- Dashboard/web surfaces
- Voice assistant microservices
- Large multi-service deployment complexity

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
npm run ci:syntax
npm test
```

Keep PRs focused. If you want to broaden the repo beyond the lean product scope, open an issue first.
