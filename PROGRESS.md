# Progreso

- [x] Fase 1 — Esqueleto
- [x] Fase 2 — Motor del juego (100 % líneas del motor, simulación de 500 partidas)
- [x] Fase 3 — Salas y sockets
- [x] Fase 4 — Cliente jugable (probado en Chrome el 2026-11-19, ver abajo)
- [x] Fase 5 — Persistencia opcional (Neon) — probada con un Pool simulado; no había Postgres local
- [x] Fase 6 — Deploy en Render: `render.yaml` + README; `npm ci && npm run build && npm start` verificado desde un clon limpio. **Falta que el humano haga los pasos 1–3 del README** (GitHub, Neon, Render).
- [x] Fase 7 — Pulido: chat, temporizador de turno, ajustes de responsive, imágenes de victoria/derrota en la pantalla final, expulsar jugadores en la sala de espera (solo el anfitrión, antes de empezar; libera el nombre de un jugador "fuera de línea" atascado), sonido de "es tu turno" (Web Audio, botón 🔔/🔕 que se recuerda por dispositivo) y animaciones en CSS (ingrediente nuevo, plaga/frío, ingrediente perdido, cambio de turno, pantalla final; respetan `prefers-reduced-motion`).
  - Descartado: modo espectador y rate limiting general (el chat sí tiene límite).

## Verificación de la fase 4
- Automático: `tests/integration/fullgame.test.js` juega una partida completa con 3 clientes Socket.io (crear → unirse → empezar → jugar hasta que alguien gana → reiniciar).
- Build de producción verificado: `/health`, `index.html`, bundle JS y `room:create` por WebSocket contra `npm start`.
- Manual en Chrome (2026-11-19), contra `npm start` con un bot como rival (cliente Socket.io):
  - Crear sala, expulsar al bot (recibe el aviso y sale de la lista), empezar partida: OK.
  - Recargar a mitad de partida: vuelve el mismo jugador con la misma mano y el mismo turno: OK.
  - Partida completa hasta "¡Ganaste!" con la imagen de victoria; la de derrota se sirve bien (200, image/jpeg): OK.
  - Animaciones de cambio de turno, ingrediente nuevo y plaga verificadas; consola sin errores.
  - **Fallo encontrado y arreglado:** al recargar, el anfitrión perdía el rol para siempre. Ahora quien creó la sala lo recupera al volver; mientras está fuera, otro jugador conectado hace de anfitrión.

## Problemas conocidos
- Las imágenes de victoria/derrota (`client/public/img/`) son capturas de Bob Esponja con copyright; habría que cambiarlas si el juego se hace público.
- `npm audit`: 0 vulnerabilidades en dependencias de producción; 6 "high" en `picomatch` (solo herramientas de desarrollo).
- Si el jugador en turno se desconecta y la sala **no** tiene temporizador, los demás esperan a que vuelva. Con temporizador, su turno se resuelve solo.
