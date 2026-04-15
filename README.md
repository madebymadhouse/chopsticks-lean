# chopsticks-lean

An intentially lean, custom version of the Chopsticks Discord bot built by Mad House ©

> This custom build of Chopsticks is running on Samuel's VPS 

`chopsticks-lean` is a PostgreSQL/Redis-backed Discord bot focused on moderation, core server tooling, custom voice channel temp rooms, and custom community server workflows. It is intentionally lean: one main bot process, no dashboard, no agents, no music stack, no Lavalink, no web app, and no AI voice orchestration layer. A lean version of Chopsticks. 

## Scope

What this repo is:
- Moderation and server administration
- Core utility and community tooling
- VoiceMaster temp rooms
- Custom VC panels and room controls
- Simple self-hosting on a low-cost VPS

What this version of Chopsticks does NOT include:
- Music
- Agents
- Dashboard
- Web app
- Multi-service voice orchestration system

## Core features

- Moderation: warn, timeout, ban, purge, logs, antispam, automod, verification
- Server tooling: tickets, reaction roles, welcome/autorole, schedules, starboard, tags, reminders, custom commands, macros
- Community features: profiles, levels, birthday tracking, giveaways, polls, suggestions
- VoiceMaster: lobby-based temp voice rooms
- Custom VC: panel-driven room creation and owner controls
- PostgreSQL + Redis runtime with health endpoints and slash command deployment scripts

## Runtime requirements

- Node.js 22+
- PostgreSQL 15+
- Redis 7+

## Quick start

```bash
git clone https://github.com/samhcharles/chopsticks-lean.git
cd chopsticks-lean
npm ci
cp .env.example .env
$EDITOR .env
npm run migrate
npm run deploy:guild
npm run bot
```

## Cheap VPS deployment

The intended path is a single cheap VPS with:
- system package Node.js 22
- local PostgreSQL
- local Redis
- one `systemd` service for the bot

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full path.

If you want Docker Compose, this repo keeps a single lean compose file:

```bash
docker compose up -d --build
```

That compose path is intentionally minimal: bot + postgres + redis.

## Environment

Start from [.env.example](./.env.example). The important variables are:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `BOT_OWNER_IDS`
- `POSTGRES_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `STORAGE_DRIVER=postgres`
- `DASHBOARD_ENABLED=false`
- `AGENTS_ENABLED=false`
- `MUSIC_ENABLED=false`

Those three feature gates stay in the repo to make the lean runtime intent explicit. In this repo, the removed heavy stacks are gone structurally as well.

## Project layout

```text
src/
  commands/        Slash commands
  events/          Discord event handlers
  tools/voice/     VoiceMaster + custom VC logic
  prefix/          Prefix command support
  utils/           Shared runtime utilities
scripts/
  ops/             systemd and operational helpers
migrations/        Database migrations
docker-compose.yml Minimal local/container deployment
```

## Voice paths kept

The lean voice path is still active and intentionally preserved:

- `src/commands/voice.js`
- `src/events/voiceStateUpdate.js`
- `src/tools/voice/*`
- `src/prefix/commands/voiceroom.js`

Custom VC is not tied to the removed music/Lavalink stack.

## Development

```bash
npm run ci:syntax
npm test
npm run verify
```

## Contributing

Small, focused contributions are preferred. Public-repo cleanup, moderation improvements, and VoiceMaster/custom-VC fixes are especially welcome.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
