# PLAN.md — Burgerazo: juego de cartas multijugador (versión web privada)

> **Instrucciones para Claude Code:** Este documento es la especificación completa del proyecto.
> Ejecútalo **de principio a fin de forma autónoma**, fase por fase, sin pedir confirmación.
> Cuando algo no esté especificado, toma la decisión más simple y razonable, anótala en
> `DECISIONS.md` y sigue. Solo detente si algo es imposible sin intervención humana
> (por ejemplo, crear cuentas en Render/Neon o pegar credenciales).

---

## 0. Reglas de trabajo (para el agente)

1. Trabaja por fases en el orden indicado. **No pases a la siguiente fase hasta que se cumplan sus criterios de aceptación** (tests en verde + verificación indicada).
2. Al terminar cada fase: ejecuta `npm test` y `npm run lint`, corrige errores y haz **un commit** con el mensaje `fase N: <resumen>`.
3. Mantén `PROGRESS.md` actualizado: fases completadas, qué falta, problemas conocidos.
4. Anota en `DECISIONS.md` cada decisión que tomes por tu cuenta (una línea cada una).
5. El código y los identificadores van en **inglés**; la interfaz de usuario y los textos visibles, en **español**.
6. No agregues dependencias innecesarias. Lista permitida abajo; si necesitas otra, justifícala en `DECISIONS.md`.
7. El **servidor es la única fuente de verdad**: el cliente nunca baraja, nunca valida reglas por su cuenta y nunca recibe cartas ajenas ni el orden del mazo.
8. Si un test falla 3 veces seguidas con el mismo enfoque, cambia de enfoque y regístralo en `PROGRESS.md`.
9. Juego original: usa colores, emojis o SVG propios para las cartas.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 20+ (ESM, `"type": "module"`) |
| Servidor | Express + Socket.io |
| Cliente | Vite + JavaScript vanilla (sin framework) + CSS propio |
| Tests | Vitest (motor y servidor), `socket.io-client` para tests de integración |
| Lint | ESLint (config recomendada) + Prettier |
| Base de datos | PostgreSQL en **Neon** (plan gratis), con el driver `pg`. **Opcional**: si `DATABASE_URL` no está definida, la app funciona solo en memoria |
| Hosting | **Render** (web service gratis), un único servicio que sirve API, sockets y el cliente compilado |

Dependencias permitidas: `express`, `socket.io`, `socket.io-client`, `pg`, `nanoid`, `vite`, `vitest`, `eslint`, `prettier`, `concurrently`.

---

## 2. Estructura del proyecto

```
/
├─ package.json            # scripts: dev, build, start, test, lint
├─ render.yaml             # blueprint de Render
├─ .env.example            # DATABASE_URL=, PORT=3000
├─ PLAN.md / PROGRESS.md / DECISIONS.md / README.md
├─ shared/
│  └─ constants.js         # colores, tipos de carta, nombres de eventos de socket
├─ server/
│  ├─ index.js             # Express + Socket.io, sirve /client/dist en producción
│  ├─ rooms.js             # gestión de salas (crear, unirse, salir, reconectar)
│  ├─ socketHandlers.js    # traduce eventos de socket ↔ motor
│  ├─ db.js                # capa de persistencia opcional (no-op sin DATABASE_URL)
│  └─ engine/
│     ├─ deck.js           # definición del mazo + shuffle (Fisher-Yates, RNG inyectable)
│     ├─ state.js          # createGame, getPlayerView
│     ├─ rules.js          # validaciones de cada jugada
│     ├─ actions.js        # applyAction(state, playerId, action) → { state, events } | { error }
│     └─ win.js            # comprobación de victoria
├─ client/
│  ├─ index.html
│  ├─ main.js              # router simple: inicio → lobby → partida
│  ├─ socket.js
│  ├─ views/ (home.js, lobby.js, game.js)
│  └─ styles.css
└─ tests/
   ├─ engine/*.test.js
   └─ integration/*.test.js
```

**Principio clave:** `server/engine/` son **funciones puras** sin E/S, sockets ni `Math.random` directo (el RNG se inyecta para que los tests sean deterministas). Todo lo demás es una envoltura del motor.

---

## 3. Reglas del juego (especificación del motor)

Las reglas completas están en **[`RULES.md`](RULES.md)**. En resumen:

- **Objetivo:** el primero con los 4 ingredientes (🥩 carne, 🧀 queso, 🥬 lechuga, 🍅 tomate) en su plato y ninguno con plaga.
- **Mazo de 66 cartas:** 20 ingredientes, 18 plagas 🪰 (2 universales 🐀), 18 fríos ❄️ (2 universales 🧊) y 10 especiales
  (🔄 Cambio de pedido, 💥 ¡Se cayó al piso!, 📋 Inspección sanitaria, ⏰ Hora pico, 🍟 Plato del día).
- **Turno:** jugar 1 carta o tirar de 1 a 3; después robar hasta tener 3.
- **Estados de un ingrediente:** fresco, con plaga, refrigerado, congelado (intocable).

### Formato de acciones
```js
{ type: 'playCard', cardId, target?: { playerId, ingredientId }, extra?: { ownIngredientId } }
{ type: 'discard', cardIds: [..] }  // 1 a 3 cartas
```
`applyAction` devuelve `{ state, events }` o `{ error: 'mensaje en español' }`. **Nunca muta el estado de entrada.**

### Vista por jugador (`getPlayerView(state, playerId)`)
Incluye: tu mano completa, los platos de todos, el nombre y el número de cartas de cada rival, el turno actual, el tamaño del mazo, la carta superior del descarte, el estado de la partida y el ganador. **Nunca** incluye las manos ajenas ni el contenido del mazo.

---

## 4. Protocolo de sockets

Cliente → servidor:
| Evento | Payload | Notas |
|---|---|---|
| `room:create` | `{ name }` | responde con `{ code, playerId }` |
| `room:join` | `{ code, name }` | máximo 6 jugadores; no se puede unir con la partida en curso |
| `room:rejoin` | `{ code, playerId }` | reconexión tras recargar (con `playerId` en `localStorage`) |
| `room:leave` | — | |
| `game:start` | — | solo el anfitrión, con al menos 2 jugadores |
| `game:action` | acción (§3) | |
| `game:restart` | — | solo el anfitrión, al terminar la partida |

Servidor → cliente:
| Evento | Payload |
|---|---|
| `room:state` | `{ code, hostId, players:[{id,name,connected}], status }` |
| `game:state` | vista filtrada de cada jugador (§3), enviada **por separado a cada socket** |
| `game:event` | log legible: "Ana le echó una plaga a la lechuga de Luis" |
| `error` | `{ message }` |

Usa callbacks de confirmación (`ack`) en todos los eventos del cliente. Los códigos de sala son de 4 letras mayúsculas sin caracteres ambiguos (sin O/0/I/1). Las salas vacías durante más de 30 minutos se eliminan.

---

## 5. Fases

### Fase 1 — Esqueleto
- `npm init`, ESM, scripts: `dev` (servidor con `--watch` + Vite, usando `concurrently`), `build`, `start`, `test`, `lint`.
- Express sirve `GET /health` → `{ ok: true }`; Socket.io conectado; Vite con proxy a `/socket.io` en desarrollo.
- Un test de Vitest que arranca el servidor y hace `GET /health`.

✅ **Aceptación:** `npm test` en verde; `npm run build && npm start` sirve el cliente en `http://localhost:3000`.

### Fase 2 — Motor del juego (la más importante)
- Implementa todo `server/engine/` según la §3.
- **Tests exhaustivos** (objetivo ≥ 90 % de cobertura del motor):
  - el mazo tiene 66 cartas con la distribución exacta; un shuffle con semilla es determinista;
  - el reparto inicial, la rotación de turnos y el robo hasta 3; rebarajar el descarte cuando el mazo se vacía;
  - cada transición de estados de un ingrediente, incluidos todos los casos inválidos;
  - cada carta especial (casos válidos e inválidos);
  - la victoria, incluida la victoria de un jugador que no está en turno;
  - jugar fuera de turno → error; usar una carta que no está en tu mano → error;
  - `getPlayerView` nunca filtra manos ajenas ni el mazo;
  - `applyAction` no muta el estado original.
- Un test de "partida simulada": bots que juegan acciones aleatorias válidas durante 500 partidas con semillas distintas, sin errores ni estados inválidos (66 cartas siempre conservadas entre mazo, manos, platos y descarte).

✅ **Aceptación:** todos los tests en verde y la simulación de 500 partidas sin fallos.

### Fase 3 — Salas y sockets
- `rooms.js` y `socketHandlers.js` según la §4.
- Tests de integración con `socket.io-client`: crear sala, que se unan 3 jugadores, iniciar, que cada uno reciba solo su propia mano, jugar un turno válido, rechazar uno fuera de turno, reconectar con `room:rejoin`, y un anfitrión que se desconecta (el rol pasa al siguiente jugador conectado).

✅ **Aceptación:** tests de integración en verde.

### Fase 4 — Cliente jugable
- **Inicio:** campo de nombre, botones "Crear sala" / "Unirse" (con código).
- **Lobby:** código grande y copiable, lista de jugadores, botón "Empezar" (solo para el anfitrión).
- **Partida:**
  - tu mano abajo; los platos de todos los jugadores en tarjetas, resaltando al que tiene el turno;
  - interacción: tocar una carta → se resaltan los objetivos válidos (el cliente puede *sugerir* objetivos, pero el servidor decide) → tocar el objetivo → se envía la acción;
  - modo "Descartar": seleccionar de 1 a 3 cartas y confirmar;
  - log de eventos, aviso de "Es tu turno" y una pantalla de victoria con "Jugar otra vez".
- **Mobile-first** (se jugará desde celulares): diseño responsive, botones grandes, sin hover obligatorio.
- Cartas dibujadas con CSS/SVG propio: color según el ingrediente, emoji según el tipo (🥩🧀🥬🍅 / 🪰🐀 / ❄️🧊 / especiales).
- Reconexión automática al recargar (`localStorage`).

✅ **Aceptación:** levanta el servidor, abre 3 pestañas, juega una partida completa sin errores de consola. Si tienes Playwright disponible, automatiza un test E2E de crear sala → unirse → empezar → jugar un turno; si no, documenta la prueba manual en `PROGRESS.md`.

### Fase 5 — Persistencia opcional (Neon)
- `db.js`: si existe `DATABASE_URL`, crea las tablas al arrancar (`CREATE TABLE IF NOT EXISTS`):
  - `games(id, room_code, started_at, ended_at, winner_name, players jsonb)`
  - `room_snapshots(room_code PK, state jsonb, updated_at)`
- Guarda un snapshot tras cada acción (sin bloquear: con *fire-and-forget* y un log de errores) y restaura las salas activas al arrancar el servidor, para que un reinicio de Render no rompa la partida.
- Sin `DATABASE_URL`, todo es un no-op y la app funciona igual.

✅ **Aceptación:** los tests pasan sin `DATABASE_URL`. Si hay una base de datos local disponible, prueba guardar y restaurar; si no, cubre `db.js` con un mock.

### Fase 6 — Preparar el deploy en Render
- `render.yaml`:
  ```yaml
  services:
    - type: web
      name: burgerazo
      runtime: node
      plan: free
      buildCommand: npm ci && npm run build
      startCommand: npm start
      healthCheckPath: /health
      envVars:
        - key: DATABASE_URL
          sync: false
        - key: NODE_VERSION
          value: 20
  ```
- El servidor usa `process.env.PORT`.
- El cliente se conecta al mismo origen (sin URLs hardcodeadas).
- `README.md` con los pasos exactos para el humano:
  1. Subir el repo a GitHub.
  2. Crear un proyecto en neon.tech y copiar el connection string.
  3. En Render: New → Blueprint → elegir el repo → pegar `DATABASE_URL`.
  4. Nota: el plan gratis de Render se duerme tras 15 min sin tráfico y tarda ~1 min en despertar; abrir la página un minuto antes de jugar.

✅ **Aceptación:** `npm ci && npm run build && npm start` funciona desde un clon limpio. **Aquí el agente se detiene y le pide al humano los pasos 1–3.**

### Fase 7 — Pulido (si queda margen)
- Temporizador de turno opcional (configurable en el lobby; al agotarse, descarta 1 carta automáticamente).
- Animaciones simples al jugar o robar cartas.
- Sonido de "es tu turno" (con opción de silenciarlo).
- ~~Modo espectador~~ (descartado por el usuario).
- ~~Rate limiting básico de eventos por socket~~ (descartado por el usuario; el chat sí tiene límite).

---

## 6. Fuera de alcance (no hacer)
- Cuentas, login o contraseñas (basta con el nombre por sala).
- Expansiones del juego.
- ~~Chat~~ (se agregó a pedido del usuario).
- Escalado horizontal / Redis.

---

## 7. Definición de "terminado"
- Fases 1–6 completas, con todos los tests en verde y el lint limpio.
- `PROGRESS.md` refleja el estado real y `DECISIONS.md` lista las decisiones tomadas.
- El `README.md` permite a alguien sin contexto correrlo en local y desplegarlo.
