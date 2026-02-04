// src/control/workerPool.js
export class WorkerPool {
  constructor() {
    this.free = new Set();
    this.bindings = new Map();
    this.workerIds = new Map();
  }

  register(ws, workerId) {
    this.free.add(ws);
    this.workerIds.set(ws, workerId ?? "unknown");
    console.log(`[control] worker registered: ${workerId}`);
  }

  unregister(ws) {
    this.free.delete(ws);
    this.workerIds.delete(ws);

    for (const [key, bound] of this.bindings.entries()) {
      if (bound === ws) {
        this.bindings.delete(key);
      }
    }
  }

  assign(guildId, channelId) {
    if (this.free.size === 0) return null;

    const ws = this.free.values().next().value;
    this.free.delete(ws);

    const key = `${guildId}:${channelId}`;
    this.bindings.set(key, ws);

    return ws;
  }

  lookup(guildId, channelId) {
    return this.bindings.get(`${guildId}:${channelId}`) ?? null;
  }

  freeWorker(ws) {
    this.free.add(ws);

    for (const [key, bound] of this.bindings.entries()) {
      if (bound === ws) {
        this.bindings.delete(key);
      }
    }
  }
}
