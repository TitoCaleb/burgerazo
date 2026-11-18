# Decisiones

- Juego re-tematizado como **Burgerazo** (hamburguesas), original; `RULES.md` reemplaza la §3 de `PLAN.md` para no copiar el juego comercial Virus!.
- Mazo de 66 cartas (20 ingredientes, 18 plagas, 18 fríos, 10 especiales); sin ingrediente comodín.
- `.npmrc` del proyecto apunta a `registry.npmjs.org` (el `~/.npmrc` global apunta a un registro privado con token vencido y Render no lo tendría).
- Dependencias extra de desarrollo: `@eslint/js` y `globals` (necesarias para la config plana de ESLint 9+) y `@vitest/coverage-v8` (medir el objetivo de cobertura ≥90 %).
- Express 5 (última versión estable); la ruta comodín del SPA usa regex.
- `server/app.js` expone `createAppServer()` sin `listen`, para que los tests arranquen el servidor en un puerto aleatorio; `server/index.js` solo escucha.
