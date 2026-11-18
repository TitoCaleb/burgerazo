import { io } from 'socket.io-client';

// Same origin in production; Vite proxies /socket.io to :3000 in development.
export const socket = io();

/** Emits with an ack; resolves with the server reply or a timeout error. */
export function request(event, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, reply) => {
      if (err) resolve({ ok: false, error: 'El servidor no responde. Revisa tu conexión.' });
      else resolve(reply);
    });
  });
}
