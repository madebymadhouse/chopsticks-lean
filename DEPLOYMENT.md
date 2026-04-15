# Deployment

This repo is designed for a cheap VPS and a simple deploy path.

## Recommended stack

- Ubuntu 24.04 or Debian 12
- Node.js 22
- PostgreSQL 15+
- Redis 7+
- `systemd`

## 1. Install dependencies

```bash
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg postgresql redis-server
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 2. Create the app directory

```bash
sudo mkdir -p /srv/chopsticks-lean
sudo chown "$USER":"$USER" /srv/chopsticks-lean
git clone https://github.com/samhcharles/chopsticks-lean.git /srv/chopsticks-lean
cd /srv/chopsticks-lean
npm ci --omit=dev
```

## 3. Configure Postgres

```bash
sudo -u postgres psql <<'SQL'
CREATE USER chopsticks WITH PASSWORD 'change-me';
CREATE DATABASE chopsticks OWNER chopsticks;
SQL
```

## 4. Configure environment

```bash
cp .env.example .env
$EDITOR .env
```

Set at minimum:
- `DISCORD_TOKEN`
- `CLIENT_ID`
- `BOT_OWNER_IDS`
- `POSTGRES_URL`
- `DATABASE_URL`
- `REDIS_URL`

Keep:
- `DASHBOARD_ENABLED=false`
- `AGENTS_ENABLED=false`
- `MUSIC_ENABLED=false`

## 5. Run migrations

```bash
npm run migrate
```

## 6. Deploy commands

For a test guild:

```bash
DEV_GUILD_ID=YOUR_GUILD_ID npm run deploy:guild
```

For global deploy:

```bash
npm run deploy:global
```

## 7. Install systemd

Example unit: [systemd/chopsticks-lean.service.example](./systemd/chopsticks-lean.service.example)

```bash
sudo cp systemd/chopsticks-lean.service.example /etc/systemd/system/chopsticks-lean.service
sudo systemctl daemon-reload
sudo systemctl enable --now chopsticks-lean.service
sudo systemctl status chopsticks-lean.service
```

## 8. Verify

```bash
npm run verify
curl http://127.0.0.1:9100/healthz
```

## Optional: Docker Compose

If you prefer containers:

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d --build
```

The shipped compose path is intentionally minimal: bot + postgres + redis.
