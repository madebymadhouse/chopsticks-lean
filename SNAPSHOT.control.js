import { WebSocketServer } from "ws";

const PORT = Number(process.env.CONTROL_PORT) || 3001;

const wss = new WebSocketServer({ port: PORT });

/** @type {Map<string, import("ws").WebSocket>} */
const workers = new Map();

console.log(`[control] listening on :${PORT}`);

wss.on("connection", ws => {
  let workerId = null;

  ws.on("message", raw => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type !== "REGISTER") return;
    if (!msg.workerId) return;

    if (workers.has(msg.workerId)) {
      ws.close();
      return;
    }

    workerId = msg.workerId;
    workers.set(workerId, ws);

    console.log("[control] worker registered:", workerId);
  });

  ws.on("close", () => {
    if (!workerId) return;
    workers.delete(workerId);
    console.log("[control] worker disconnected:", workerId);
  });

  ws.on("error", () => {
    if (!workerId) return;
    workers.delete(workerId);
    console.log("[control] worker errored:", workerId);
  });
});
