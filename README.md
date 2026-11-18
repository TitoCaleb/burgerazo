# 🍔 Burgerazo

Juego de cartas multijugador (2 a 6 personas) para jugar con amigos desde el celular.
Arma tu hamburguesa con 🥩 🧀 🥬 🍅 antes que nadie mientras saboteas las de los demás.
Las reglas completas están en [`RULES.md`](RULES.md).

## Correrlo en local

Requisitos: Node.js 20 o superior.

```bash
npm install
npm run dev        # servidor en :3000 + Vite en http://localhost:5173 (recarga en vivo)
```

Para probar la versión de producción:

```bash
npm run build
npm start          # http://localhost:3000
```

Para jugar en local con amigos en la misma red Wi-Fi, abre `http://<IP-de-tu-PC>:3000` desde los celulares.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm test` | Tests del motor, de los sockets y de la persistencia |
| `npm run test:coverage` | Lo mismo, con cobertura |
| `npm run lint` | ESLint + Prettier (verifica) |
| `npm run format` | Formatea con Prettier |

La base de datos es **opcional**: sin `DATABASE_URL`, todo vive en memoria.
Con ella, las partidas sobreviven a un reinicio del servidor.

## Publicarlo gratis (Render + Neon)

1. **Sube el repo a GitHub** (puede ser privado).
2. **Base de datos (opcional, recomendado):** crea un proyecto gratis en [neon.tech](https://neon.tech) y
   copia el *connection string* (`postgresql://…?sslmode=require`).
3. **En [Render](https://render.com):** *New → Blueprint* → elige el repo. Render lee `render.yaml`
   y te pide `DATABASE_URL`: pega el connection string de Neon (o déjalo vacío para usar solo memoria).
4. Al terminar el deploy tendrás una URL como `https://burgerazo.onrender.com`. Compártela.

> ⏰ El plan gratis de Render **se duerme tras 15 minutos sin tráfico** y tarda cerca de 1 minuto en
> despertar. Abre la página un minuto antes de jugar.

## Cómo se juega (resumen)

1. Una persona crea la sala y comparte el código de 4 letras (o el enlace).
2. Los demás se unen con su nombre y el código. El anfitrión pulsa **Empezar**.
3. En tu turno: toca una carta y luego el ingrediente donde quieres jugarla, o usa **Tirar cartas**.
4. Si recargas la página o se te corta la conexión, vuelves automáticamente a tu lugar.

## Estructura

```
shared/constants.js     constantes y nombres de eventos compartidos
server/engine/          motor del juego: funciones puras, sin E/S
server/rooms.js         salas (crear, unirse, reconectar, anfitrión)
server/socketHandlers.js eventos de Socket.io ↔ salas/motor
server/db.js            persistencia opcional (no-op sin DATABASE_URL)
client/                 Vite + JS vanilla (inicio, lobby, partida)
tests/                  Vitest: motor, integración por sockets, base de datos
```

El servidor es la única fuente de verdad: el cliente nunca baraja ni recibe cartas ajenas.
