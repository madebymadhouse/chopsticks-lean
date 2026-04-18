# Chopsticks Lean

The Discord bot running the [Mad House](https://madebymadhouse.cloud) community server.

This is a lean build of [Chopsticks](https://github.com/samhcharles/chopsticks) — the full-featured open-source Discord bot also built by Mad House. Lean means one process, one VPS, no dashboard, no agents, no music stack. Everything a growing community needs, nothing it doesn't.

---

## Quickest Setup — Let an AI Do It

If you want to run this bot on your own server and don't want to figure out the setup yourself, copy the prompt below into [Claude Code](https://claude.ai/code), Cursor, or any AI coding assistant. It'll walk you through the entire process — you just answer its questions.

```
I want to self-host the Chopsticks Lean Discord bot for my Discord server.
The repo is at https://github.com/samhcharles/chopsticks-lean

Please help me:
1. Clone the repo and review what it does
2. Create a Discord bot application at discord.com/developers and walk me through getting my token and client ID
3. Fill in the .env file with all required values
4. Start the bot using Docker Compose
5. Deploy the slash commands to my Discord server
6. Verify the bot is online and working

I have a Linux VPS with Docker and Docker Compose installed.
Walk me through each step one at a time.
```

That's it. The AI will handle everything. The whole process takes under 15 minutes.

---

## What's Included

**Moderation**
- Warn, timeout, kick, ban, purge
- Mod logs, antispam, automod, verification gate

**Tickets**
- Private ticket channels with support role access
- Transcripts on close
- Auto-close after 48 hours of owner inactivity
- Optional support discussion channel crosspost

**Voice Rooms**
- Lobby-based temporary voice rooms (join lobby → get a private room)
- Per-room control panel: rename, resize, set public/private, guestlist, restrictions
- Auto-delete when everyone leaves

**Leveling / Creds**
- Activity-based Creds system (chat + voice)
- Rank cards, leaderboard, level-up announcements
- Configurable level roles

**Economy**
- Balance, daily, work, gather, pay
- Creds as server currency

**Scheduled Messages**
- Water reminders, custom polls, DM broadcasts
- Persistent across restarts

**Server Tools**
- Welcome, rules, and FAQ post commands with generated SVG banners
- Reaction roles
- Reminders
- Starboard
- Suggestions

**DM Updates**
- Role-gated DM broadcast system (`/dm-update broadcast`)
- `!subscribe` / `!unsub` for members to opt in/out

---

## What's Stripped (vs full Chopsticks)

- No music / Lavalink
- No AI agents
- No web dashboard
- No multi-service voice orchestration
- No trading cards, casino, pets, or trivia

---

## Requirements

```
Node.js 22+
PostgreSQL 15+
Redis 7+
Docker + Docker Compose (recommended)
A Discord bot application — discord.com/developers
```

---

## Manual Setup

If you'd rather do it yourself:

**1. Create your Discord bot**

Go to [discord.com/developers](https://discord.com/developers/applications), create a new application, add a bot, and copy the token. Enable the following intents under the Bot tab:
- Server Members Intent
- Message Content Intent

**2. Clone and configure**

```bash
git clone https://github.com/samhcharles/chopsticks-lean.git
cd chopsticks-lean
cp .env.example .env
```

Open `.env` and fill in at minimum:

```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
DEV_GUILD_ID=your_server_id
BOT_OWNER_IDS=your_discord_user_id
```

**3. Start with Docker Compose**

```bash
docker compose up -d --build
```

This starts the bot, Postgres, and Redis together. Postgres and Redis data persist in Docker volumes.

**4. Deploy slash commands**

```bash
docker compose exec bot npm run deploy:guild
```

Run this once after first boot, and again any time you add or change slash commands.

**5. Invite the bot**

In the Discord developer portal, go to OAuth2 → URL Generator. Select `bot` and `applications.commands` scopes, then add the permissions your server needs (at minimum: Manage Channels, Manage Roles, Send Messages, Embed Links, Read Message History).

---

## Key Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token from Discord developer portal |
| `CLIENT_ID` | Yes | Application ID from Discord developer portal |
| `DEV_GUILD_ID` | Yes | Your server ID — used for slash command deployment |
| `POSTGRES_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `BOT_OWNER_IDS` | Yes | Your Discord user ID (comma-separated for multiple) |
| `BANNER_URL` | No | Image URL shown in welcome and rules embeds |
| `COLOR_PRIMARY` | No | Primary embed color as a hex integer (default: `0xCC3300`) |
| `BOT_SERVER_NAME` | No | Your server's name for bot copy (default: `Your Server`) |
| `BOT_HUB_URL` | No | Link shown in welcome embed hub button |
| `BOT_GITHUB_URL` | No | Link shown in welcome embed GitHub button |
| `BOT_WEBSITE_URL` | No | Link shown in welcome embed website button |

See [.env.example](./.env.example) for the full list.

---

## Project Layout

```
src/
  commands/        Slash commands
  events/          Discord event handlers
  prefix/          Prefix command router and commands
  tools/voice/     Voice room logic (lobby, custom VC, panel)
  utils/           Shared runtime utilities
  config/          Branding and feature flags
  game/            Leveling, economy, render (rank cards, SVG banners)
migrations/        PostgreSQL schema migrations
scripts/           Slash command deploy and ops helpers
docker-compose.yml Bot + Postgres + Redis
```

---

## Running Without Docker

If you're running directly on a VPS with Node, Postgres, and Redis already installed:

```bash
npm ci
npm run migrate
npm run deploy:guild
node src/index.js
```

For process management, use `pm2` or a `systemd` unit. The bot is a single process.

---

## Origin

Chopsticks Lean is derived from [Chopsticks](https://github.com/samhcharles/chopsticks), the full-featured open-source Discord bot built by Mad House. The lean build exists because the Mad House server doesn't need every feature from the full stack — and running lean means fewer things to maintain, fewer things to break, and lower VPS cost.

If you want every feature including music, AI agents, and a web dashboard, start from the full Chopsticks repo instead.

---

## Contributing

Small, focused PRs only. Bug fixes, moderation improvements, and voice room fixes are welcome. Open an issue before building something large.

---

## License

[MIT](./LICENSE)
