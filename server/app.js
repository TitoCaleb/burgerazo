import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';

const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');

/** Builds the HTTP + Socket.io server without listening. */
export function createAppServer() {
  const app = express();
  app.get('/health', (_req, res) => res.json({ ok: true }));

  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  }

  const httpServer = createServer(app);
  const io = new Server(httpServer);
  return { app, httpServer, io };
}
