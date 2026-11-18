# Progreso

- [x] Fase 1 — Esqueleto
- [x] Fase 2 — Motor del juego (100 % líneas del motor, simulación de 500 partidas)
- [x] Fase 3 — Salas y sockets
- [x] Fase 4 — Cliente jugable (falta la prueba manual en navegador, ver abajo)
- [ ] Fase 5 — Persistencia opcional (Neon)
- [ ] Fase 6 — Deploy en Render
- [ ] Fase 7 — Pulido

## Verificación de la fase 4
- Automático: `tests/integration/fullgame.test.js` juega una partida completa con 3 clientes Socket.io (crear → unirse → empezar → jugar hasta que alguien gana → reiniciar).
- Build de producción verificado: `/health`, `index.html`, bundle JS y `room:create` por WebSocket contra `npm start`.
- **Pendiente (manual):** no había Playwright ni extensión de navegador conectada. Prueba manual:
  1. `npm run build && npm start` y abrir `http://localhost:3000` en 3 pestañas.
  2. Pestaña 1: nombre → "Crear sala". Pestañas 2 y 3: nombre + código → "Unirse".
  3. Anfitrión → "¡Empezar partida!". Jugar hasta la pantalla de victoria; revisar que la consola no tenga errores.
  4. Recargar una pestaña a mitad de partida: debe volver al mismo jugador con la misma mano.

## Problemas conocidos
- Si el jugador en turno se desconecta, los demás esperan a que vuelva (el temporizador de turno de la fase 7 lo resolvería).
