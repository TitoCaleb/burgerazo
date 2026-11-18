# PLAN.md — Juego de cartas multijugador "Virus" (versión web privada)

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
9. Uso privado entre amigos: no copies arte ni logos del juego comercial. Usa colores, emojis o SVG propios para las cartas.

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

### 3.1 Mazo (68 cartas)

| Tipo | Rojo (corazón) | Azul (cerebro) | Verde (estómago) | Amarillo (hueso) | Multicolor | Total |
|---|---|---|---|---|---|---|
| Órgano | 5 | 5 | 5 | 5 | 1 | 21 |
| Virus | 4 | 4 | 4 | 4 | 1 | 17 |
| Medicina | 4 | 4 | 4 | 4 | 4 | 20 |

**Tratamientos (10):** Trasplante ×2, Ladrón de órganos ×3, Contagio ×2, Guante de látex ×1, Error médico ×1.

Cada carta tiene un `id` único (`card_01`…`card_68`), `type` (`organ|virus|medicine|treatment`), `color` (`red|blue|green|yellow|multi`) o `treatment` (`transplant|organThief|contagion|latexGlove|medicalError`).

### 3.2 Partida
- De 2 a 6 jugadores.
- Al empezar: se baraja el mazo, se reparten 3 cartas a cada jugador y se elige al azar quién empieza. El orden de turnos es el orden de llegada a la sala.
- **Cuerpo** de cada jugador: lista de órganos; cada órgano tiene `modifiers: []` (virus/medicinas encima).
- **Turno:** el jugador hace **una** de estas cosas:
  - **Jugar 1 carta** (sobre su cuerpo, el de otro o como tratamiento).
  - **Descartar de 1 a 3 cartas** de su mano.
- Después **roba hasta tener 3 cartas**. Si el mazo se vacía, se baraja el descarte para formar un mazo nuevo.
- Si un jugador no tiene cartas al empezar su turno (por el Guante de látex), su turno consiste solo en robar 3 y pasa al siguiente.

### 3.3 Compatibilidad de colores
Una carta es compatible con un órgano si tienen el mismo color **o** si cualquiera de los dos es `multi`.

### 3.4 Estados de un órgano
| Estado | Modifiers |
|---|---|
| Sano | ninguno |
| Infectado | 1 virus |
| Vacunado | 1 medicina |
| Inmunizado | 2 medicinas (permanente; nada lo afecta) |

### 3.5 Jugar órganos, virus y medicinas
- **Órgano:** va siempre a tu propio cuerpo. No puedes tener dos órganos del mismo color (el multicolor cuenta como un color propio, `multi`, y solo puede haber uno).
- **Virus** (sobre el órgano compatible de **otro** jugador):
  - Sano → infectado.
  - Infectado → se **extirpa** el órgano (órgano + 2 virus van al descarte).
  - Vacunado → virus y medicina van al descarte (el órgano queda sano).
  - Inmunizado → no se puede jugar.
- **Medicina** (sobre un órgano compatible **propio**):
  - Sano → vacunado.
  - Vacunado → inmunizado.
  - Infectado → medicina y virus van al descarte (el órgano queda curado).
  - Inmunizado → no se puede jugar.

### 3.6 Tratamientos (todos van al descarte después de jugarse)
- **Trasplante:** intercambia un órgano (con sus modifiers) entre dos jugadores cualesquiera, incluido tú mismo. Ninguno de los dos puede quedar con colores repetidos. No se pueden trasplantar órganos inmunizados.
- **Ladrón de órganos:** roba un órgano no inmunizado de otro jugador y lo pone en tu cuerpo (no puedes tener ya ese color).
- **Contagio:** traslada tantos virus de tus órganos como sea posible a órganos **sanos y sin modifiers** de otros jugadores, con color compatible. Con un solo objetivo válido por virus se resuelve sola; si hay varios, el cliente envía el reparto y el servidor lo valida. Para el MVP vale una asignación automática greedy, registrada en `DECISIONS.md`.
- **Guante de látex:** todos los demás jugadores descartan su mano entera (y por lo tanto en su siguiente turno solo roban).
- **Error médico:** intercambias tu cuerpo completo con el de otro jugador.

### 3.7 Victoria
Gana el primer jugador cuyo cuerpo tenga **4 órganos de colores distintos que no estén infectados** (vacunados e inmunizados cuentan como sanos; el órgano multicolor cuenta como uno de los 4). Se comprueba después de cada acción, para **todos** los jugadores (con Trasplante o Error médico puede ganar alguien que no es el jugador en turno).

### 3.8 Formato de acciones
```js
{ type: 'playCard', cardId, target?: { playerId, organId }, extra?: {...} }
{ type: 'discard', cardIds: [..] }  // 1 a 3 cartas
```
`applyAction` devuelve `{ state, events }` o `{ error: 'mensaje en español' }`. **Nunca muta el estado de entrada.**

### 3.9 Vista por jugador (`getPlayerView(state, playerId)`)
Incluye: tu mano completa, los cuerpos de todos, el nombre y el número de cartas de cada rival, el turno actual, el tamaño del mazo, la carta superior del descarte, el estado de la partida y el ganador. **Nunca** incluye las manos ajenas ni el contenido del mazo. Debe haber un test que lo verifique.

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
| `game:action` | acción (§3.8) | |
| `game:restart` | — | solo el anfitrión, al terminar la partida |

Servidor → cliente:
| Evento | Payload |
|---|---|
| `room:state` | `{ code, hostId, players:[{id,name,connected}], status }` |
| `game:state` | vista filtrada de cada jugador (§3.9), enviada **por separado a cada socket** |
| `game:event` | log legible: "Ana infectó el corazón de Luis" |
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
  - el mazo tiene 68 cartas con la distribución exacta; un shuffle con semilla es determinista;
  - el reparto inicial, la rotación de turnos y el robo hasta 3; rebarajar el descarte cuando el mazo se vacía;
  - cada transición de la tabla §3.5, incluidos todos los casos inválidos;
  - cada tratamiento (casos válidos e inválidos);
  - la victoria, incluida la victoria de un jugador que no está en turno;
  - jugar fuera de turno → error; usar una carta que no está en tu mano → error;
  - `getPlayerView` nunca filtra manos ajenas ni el mazo;
  - `applyAction` no muta el estado original.
- Un test de "partida simulada": bots que juegan acciones aleatorias válidas durante 500 partidas con semillas distintas, sin errores ni estados inválidos (68 cartas siempre conservadas entre mazo, manos, cuerpos y descarte).

✅ **Aceptación:** todos los tests en verde y la simulación de 500 partidas sin fallos.

### Fase 3 — Salas y sockets
- `rooms.js` y `socketHandlers.js` según la §4.
- Tests de integración con `socket.io-client`: crear sala, que se unan 3 jugadores, iniciar, que cada uno reciba solo su propia mano, jugar un turno válido, rechazar uno fuera de turno, reconectar con `room:rejoin`, y un anfitrión que se desconecta (el rol pasa al siguiente jugador conectado).

✅ **Aceptación:** tests de integración en verde.

### Fase 4 — Cliente jugable
- **Inicio:** campo de nombre, botones "Crear sala" / "Unirse" (con código).
- **Lobby:** código grande y copiable, lista de jugadores, botón "Empezar" (solo para el anfitrión).
- **Partida:**
  - tu mano abajo; los cuerpos de todos los jugadores en tarjetas, resaltando al que tiene el turno;
  - interacción: tocar una carta → se resaltan los objetivos válidos (el cliente puede *sugerir* objetivos, pero el servidor decide) → tocar el objetivo → se envía la acción;
  - modo "Descartar": seleccionar de 1 a 3 cartas y confirmar;
  - log de eventos, aviso de "Es tu turno" y una pantalla de victoria con "Jugar otra vez".
- **Mobile-first** (se jugará desde celulares): diseño responsive, botones grandes, sin hover obligatorio.
- Cartas dibujadas con CSS/SVG propio: color de fondo según el color, emoji o icono según el tipo (🫀🧠🫃🦴 / 🦠 / 💉 / tratamientos).
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
      name: virus-online
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
- Contagio con reparto manual en lugar de greedy.
- Modo espectador.
- Rate limiting básico de eventos por socket.

---

## 6. Fuera de alcance (no hacer)
- Cuentas, login o contraseñas (basta con el nombre por sala).
- Expansiones del juego.
- Chat (opcional en la fase 7 solo si sobra tiempo).
- Escalado horizontal / Redis.

---

## 7. Definición de "terminado"
- Fases 1–6 completas, con todos los tests en verde y el lint limpio.
- `PROGRESS.md` refleja el estado real y `DECISIONS.md` lista las decisiones tomadas.
- El `README.md` permite a alguien sin contexto correrlo en local y desplegarlo.
