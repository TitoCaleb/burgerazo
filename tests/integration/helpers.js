import { io as connect } from 'socket.io-client';
import { createAppServer } from '../../server/app.js';

/** Starts the server on a random port. Call `close()` in afterAll/afterEach. */
export async function startServer(options) {
  const server = createAppServer(options);
  await new Promise((resolve) => server.httpServer.listen(0, resolve));
  const url = `http://localhost:${server.httpServer.address().port}`;
  const clients = [];

  const client = () => {
    const socket = connect(url, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    socket.received = { 'game:state': [], 'room:state': [], 'game:event': [] };
    for (const ev of Object.keys(socket.received)) {
      socket.on(ev, (data) => socket.received[ev].push(data));
    }
    return socket;
  };

  const close = async () => {
    for (const c of clients) c.disconnect();
    await new Promise((resolve) => server.io.close(resolve));
  };

  return { ...server, url, client, close };
}

/** Emits with an ack and resolves with the server reply. */
export const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

/** Resolves when `predicate` is true for the socket's latest received payload of `event`. */
export function waitFor(socket, event, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const last = socket.received[event].at(-1);
      if (last !== undefined && predicate(last)) return resolve(last);
      if (Date.now() - started > timeout) return reject(new Error(`timeout waiting for ${event}`));
      setTimeout(check, 10);
    };
    check();
  });
}
