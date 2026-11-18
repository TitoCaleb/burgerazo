import { createAppServer } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { httpServer } = createAppServer();

httpServer.listen(port, () => {
  console.log(`Burgerazo escuchando en http://localhost:${port}`);
});
