# Burgerazo — Reglas del juego

> Especificación del motor (resumida en la §3 de `PLAN.md`). Juego original con temática de hamburguesas:
> el resto del plan (stack, fases, protocolo, deploy) se mantiene igual.

## Objetivo
Gana el primer jugador que tenga en su plato una **hamburguesa completa**: los 4 ingredientes
(🥩 carne, 🧀 queso, 🥬 lechuga y 🍅 tomate) y **ninguno con plaga**.
Refrigerados y congelados cuentan como buenos.

## Mazo (66 cartas)

| Tipo | 🥩 Carne | 🧀 Queso | 🥬 Lechuga | 🍅 Tomate | Universal | Total |
|---|---|---|---|---|---|---|
| Ingrediente | 5 | 5 | 5 | 5 | — | 20 |
| Plaga 🪰 | 4 | 4 | 4 | 4 | 2 (🐀 Rata) | 18 |
| Frío ❄️ | 4 | 4 | 4 | 4 | 2 (🧊 Nevera) | 18 |

**Cartas especiales (10):**

| Carta | Copias | Efecto |
|---|---|---|
| 🔄 Cambio de pedido | 3 | Cambias uno de tus ingredientes (con lo que tenga encima) por uno de otro jugador. Ninguno puede estar congelado y nadie puede quedar con ingredientes repetidos. |
| 💥 ¡Se cayó al piso! | 2 | Un ingrediente de otro jugador sin frío (fresco o con plaga) se va a la basura con lo que tenga encima. |
| 📋 Inspección sanitaria | 2 | Todos los ingredientes con plaga de **todos** los platos (también el tuyo) se van a la basura. |
| ⏰ Hora pico | 1 | Cada jugador le pasa su mano completa al siguiente jugador en el orden de turnos. |
| 🍟 Plato del día | 2 | Robas 2 cartas extra de inmediato (tu mano puede quedar con más de 3). |

Las cartas especiales van a la basura (descarte) después de jugarse.

## Partida
- De 2 a 6 jugadores. Se baraja, se reparten 3 cartas a cada uno y se sortea quién empieza.
  El orden de turnos es el orden de llegada a la sala.
- En tu turno haces **una** cosa:
  - **Jugar 1 carta**, o
  - **Tirar de 1 a 3 cartas** a la basura.
- Después **robas hasta tener 3 cartas**. Si el mazo se acaba, la basura se baraja y forma un mazo nuevo.
- Si empiezas tu turno sin cartas, robas 3 automáticamente; si aun así no tienes, pasas.

## Compatibilidad
Una plaga o un frío es compatible con un ingrediente si es del mismo tipo **o** si es universal (🐀 / 🧊).

## Estados de un ingrediente
| Estado | Encima |
|---|---|
| Fresco | nada |
| Con plaga | 1 plaga |
| Refrigerado | 1 frío |
| Congelado | 2 fríos (permanente: nada lo afecta) |

## Jugar cartas
- **Ingrediente:** siempre a tu propio plato. No puedes tener dos del mismo tipo.
- **Plaga** (sobre un ingrediente compatible de **otro** jugador):
  - Fresco → con plaga.
  - Con plaga → **se echa a perder**: ingrediente y las 2 plagas a la basura.
  - Refrigerado → plaga y frío a la basura (queda fresco).
  - Congelado → no se puede.
- **Frío** (sobre un ingrediente compatible **tuyo**):
  - Fresco → refrigerado.
  - Refrigerado → congelado.
  - Con plaga → frío y plaga a la basura (queda fresco).
  - Congelado → no se puede.

## Victoria
Se comprueba después de cada acción para **todos** los jugadores. Si varios cumplen a la vez,
gana el jugador en turno o, si no es él, el primero en el orden de turnos a partir de él.
