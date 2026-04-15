#!/usr/bin/env node
/**
 * scripts/verify-setup.js
 * Verification script for chopsticks-lean self-hosters.
 * Checks environment, PostgreSQL, Redis, and the command surface.
 */

import "dotenv/config";
import pg from "pg";
import Redis from "ioredis";
import { existsSync, readdirSync } from "fs";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m"
};

const print = (msg) => console.log(msg);
const success = (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`);
const warn = (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
const error = (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`);
const info = (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`);

async function main() {
  print(`\n${colors.bold}${colors.cyan}chopsticks-lean verification${colors.reset}\n`);

  // 1. Node.js version
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0]);
  if (major >= 20) {
    success(`Node.js version: ${nodeVersion}`);
  } else {
    error(`Node.js version too low: ${nodeVersion}. Required: 20+ (LTS 22 recommended)`);
  }

  // 2. .env check
  if (existsSync(".env")) {
    success(".env file found");
  } else {
    error(".env file missing. Copy .env.example to .env and fill in values.");
  }

  // 3. Required environment variables
  const requiredVars = ["DISCORD_TOKEN", "CLIENT_ID", "POSTGRES_URL", "REDIS_URL"];
  let allVars = true;
  for (const v of requiredVars) {
    if (process.env[v]) {
      // mask token
      const val = v.includes("TOKEN") || v.includes("URL") ? "***" : process.env[v];
      // success(`${v} is set`);
    } else {
      error(`${v} is missing in .env`);
      allVars = false;
    }
  }
  if (allVars) success("Required environment variables are set");

  // 4. PostgreSQL connection
  if (process.env.POSTGRES_URL) {
    const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL });
    try {
      const start = Date.now();
      await pool.query("SELECT 1");
      success(`PostgreSQL connection successful (${Date.now() - start}ms)`);
    } catch (e) {
      error(`PostgreSQL connection failed: ${e.message}`);
    } finally {
      await pool.end();
    }
  }

  // 5. Redis connection
  if (process.env.REDIS_URL) {
    const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    try {
      const start = Date.now();
      await redis.connect();
      success(`Redis connection successful (${Date.now() - start}ms)`);
    } catch (e) {
      error(`Redis connection failed: ${e.message}`);
    } finally {
      redis.disconnect();
    }
  }

  // 6. Lean switches
  const dashboardEnabled = String(process.env.DASHBOARD_ENABLED ?? "false").toLowerCase() === "true";
  const agentsEnabled = String(process.env.AGENTS_ENABLED ?? "false").toLowerCase() === "true";
  const musicEnabled = String(process.env.MUSIC_ENABLED ?? "false").toLowerCase() === "true";
  if (dashboardEnabled || agentsEnabled || musicEnabled) {
    warn("Lean switches are not fully disabled. Public lean deployments should keep DASHBOARD_ENABLED=false, AGENTS_ENABLED=false, MUSIC_ENABLED=false.");
  } else {
    success("Lean switches are correctly disabled");
  }

  // 7. Command registry check
  try {
    const files = readdirSync("src/commands").filter(f => f.endsWith(".js"));
    success(`Command surface: ${files.length} command groups found in src/commands/`);
  } catch (e) {
    error(`Failed to read src/commands: ${e.message}`);
  }

  // 8. Custom VC path check
  const requiredVoiceFiles = [
    "src/commands/voice.js",
    "src/events/voiceStateUpdate.js",
    "src/prefix/commands/voiceroom.js",
    "src/tools/voice/customVcsUi.js"
  ];
  const missingVoiceFiles = requiredVoiceFiles.filter(file => !existsSync(file));
  if (missingVoiceFiles.length) {
    error(`Custom VC path incomplete: missing ${missingVoiceFiles.join(", ")}`);
  } else {
    success("Custom VC / VoiceMaster files are present");
  }

  print(`\n${colors.bold}${colors.cyan}Verification complete.${colors.reset}\n`);
  print(`Next steps:`);
  print(`1. Deploy slash commands:  ${colors.blue}npm run deploy:guild${colors.reset} or ${colors.blue}npm run deploy:global${colors.reset}`);
  print(`2. Start the bot:          ${colors.blue}npm start${colors.reset}`);
  print("");
}

main().catch(e => {
  error(`Unexpected error: ${e.message}`);
  process.exit(1);
});
