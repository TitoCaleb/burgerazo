import { createAppServer } from './app.js';
import { createDb } from './db.js';
import { RoomManager } from './rooms.js';

const port = Number(process.env.PORT) || 3000;

const db = await createDb();
const manager = new RoomManager({
  onChange: (room) => db.saveRoom(room),
  onDelete: (code) => db.deleteRoom(code),
  onGameEnd: (room) => db.recordGame(room),
});

if (db.enabled) {
  try {
    await db.init();
    const restored = manager.restore(await db.loadRooms());
    console.log(`[db] conectado; ${restored} sala(s) restaurada(s)`);
  } catch (err) {
    console.error('[db] no se pudo inicializar, sigo solo en memoria:', err.message);
  }
} else {
  console.log('[db] sin DATABASE_URL: solo en memoria');
}

const { httpServer } = createAppServer({ manager });
httpServer.listen(port, () => {
  console.log(`Burgerazo escuchando en http://localhost:${port}`);
});
