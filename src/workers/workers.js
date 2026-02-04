import { Client, GatewayIntentBits } from "discord.js";
import WebSocket from "ws";

/* ───────── ENV GUARDS ───────── */

const token = process.env.WORKER_TOKEN;
if (!token) {
  console.error("[worker] WORKER_TOKEN missing");
  process.exit(1);
}

const controlUrl = process.env.CONTROL_URL;
if (!controlUrl) {
  console.error("[worker] CONTROL_URL missing");
  process.exit(1);
}

/* ───────── DISCORD CLIENT ───────── */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

/* ───────── CONTROL WS ───────── */

let ws = null;
let registered = false;

/* ───────── LIFECYCLE ───────── */

client.once("ready", () => {
  console.log(`[worker] online as ${client.user.tag}`);

  ws = new WebSocket(controlUrl);

  ws.once("open", () => {
    ws.send(JSON.stringify({
      type: "REGISTER",
      workerId: client.user.id
    }));

    registered = true;
  });

  ws.once("close", () => {
    console.error("[worker] control connection closed");
    process.exit(1);
  });

  ws.once("error", err => {
    console.error("[worker] control ws error", err);
    process.exit(1);
  });
});

client.on("error", err => {
  console.error("[worker] discord error", err);
  process.exit(1);
});

/* ───────── HARD FAIL SAFETY ───────── */

process.on("unhandledRejection", err => {
  console.error("[worker] unhandled rejection", err);
  process.exit(1);
});

process.on("uncaughtException", err => {
  console.error("[worker] uncaught exception", err);
  process.exit(1);
});

/* ───────── START ───────── */

await client.login(token);
