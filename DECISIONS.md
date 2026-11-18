# Decisiones

- Juego re-tematizado como **Burgerazo** (hamburguesas), original; `RULES.md` reemplaza la §3 de `PLAN.md` para no copiar el juego comercial Virus!.
- Mazo de 66 cartas (20 ingredientes, 18 plagas, 18 fríos, 10 especiales); sin ingrediente comodín.
- `.npmrc` del proyecto apunta a `registry.npmjs.org` (el `~/.npmrc` global apunta a un registro privado con token vencido y Render no lo tendría).
- Dependencias extra de desarrollo: `@eslint/js` y `globals` (necesarias para la config plana de ESLint 9+) y `@vitest/coverage-v8` (medir el objetivo de cobertura ≥90 %).
- Express 5 (última versión estable); la ruta comodín del SPA usa regex.
- `server/app.js` expone `createAppServer()` sin `listen`, para que los tests arranquen el servidor en un puerto aleatorio; `server/index.js` solo escucha.
- RNG mulberry32 con su estado guardado en `state.rngState`: `applyAction` es pura y determinista (no recibe RNG aparte).
- Los objetivos usan `{ playerId, ingredientId }` (el `ingredientId` es el id de la carta de ingrediente); Cambio de pedido usa `extra.ownIngredientId`.
- Empate de victoria: gana el jugador en turno y luego el orden de turnos desde él.
- Si nadie tiene cartas ni quedan en mazo/basura, la partida termina en empate (`winnerId: null`); prácticamente imposible pero evita bucles.
- Los eventos del motor son `{ text }` en español, listos para el log.
- `.gitattributes` fuerza LF para que Prettier no falle en Windows.
- `room:create`/`room:join` devuelven además un `token` secreto; `room:rejoin` pide `{ code, playerId, token }` porque el `playerId` es público y cualquiera podría suplantarlo.
- Las respuestas por ack son `{ ok: true, ... }` o `{ ok: false, error }`; el evento `error` solo se emite si el cliente no manda ack.
- `game:state` incluye `log` (últimos 30 textos) para que quien se reconecta vea el historial.
- Salir del lobby elimina al jugador; salir a mitad de partida solo lo desconecta (puede volver con `room:rejoin`).
- Nombres de 1 a 20 caracteres, sin repetir dentro de la sala (sin distinguir mayúsculas).
