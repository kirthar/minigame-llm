# Reglas del juego

Referencia completa de la simulación: fases, resolución de turno, fórmulas y
condiciones de victoria. Los valores numéricos citados aquí son los actuales
en `src/config/*.ts` — si se cambia la configuración, esos ficheros son la
fuente de verdad; este documento debe mantenerse en sincronía.

## 1. Estructura de la partida

Una partida tiene 2–6 ejércitos (`GAME_CONFIG.minArmies`/`maxArmies`, 4 por
defecto), cada uno controlado por un `Agent` (ver `docs/AGENT_CONTRACTS.md`).
Es un juego de **información perfecta**: todos los agentes ven el estado
completo del campo (todas las unidades de todos los ejércitos) en todo
momento; no hay niebla de guerra.

La partida pasa por 3 fases (`Phase` en `src/domain/types.ts`):

1. **`PREPARATION`**: cada agente forma su ejército con un presupuesto de
   puntos.
2. **`BATTLE`**: hasta `GAME_CONFIG.maxTurns` (30) turnos de combate por
   fases simultáneas.
3. **`FINISHED`**: la partida terminó; `GameState.winner` tiene el ganador
   (o `null` si hubo empate).

## 2. Fase de preparación

Cada agente recibe un `ArmyBuildContext` (ver contrato) con un presupuesto de
`GAME_CONFIG.budget` puntos (1600 por defecto) y devuelve un `ArmyBlueprint`:
una lista de `{ type, rank }` (tipo de tropa + rango inicial 1–5).

- **Coste de una unidad** = `ceil(baseCost(type) × COST_MULTIPLIER[rank-1])`.
- El motor **valida el presupuesto**: recorre el blueprint en orden y acepta
  entradas mientras quepan en el presupuesto restante; las que no quepan se
  descartan silenciosamente (no hay error, simplemente esa unidad no se
  crea). Un agente no puede pasarse de presupuesto.
- Las unidades aceptadas se despliegan en una formación de rejilla
  (`formationPositions`, columnas = `⌈√n⌉`) centrada en el punto de
  despliegue de su ejército.
- **Posiciones iniciales**: los `N` ejércitos se colocan **equidistantes en
  un círculo** de radio `(fieldSize/2) × spawnRadiusFactor` (0.82) centrado
  en el campo, empezando arriba (−90°) y repartidos cada `360°/N` — ninguna
  posición inicial da ventaja sobre otra.
- Tras desplegar todos los ejércitos, cada agente recibe una llamada única a
  `onBattleStart(view)` con el estado inicial completo, para analizar el
  campo antes del primer turno.

## 3. Fase de batalla — resolución de un turno (`GameEngine.tick()`)

Cada turno se resuelve en 6 pasos, siempre sobre el **mismo snapshot de
inicio de turno** para todos los agentes (simultáneo, sin ventaja de orden):

1. **Incremento de turno**: `turn += 1`, se emite `TurnEvent`.
2. **Diplomacia**: se llama a `agent.planDiplomacy(view)` de todos los
   ejércitos (mismo snapshot); se resuelven primero todas las intenciones
   `break` (rompen pactos existentes), luego se forma una alianza para cada
   par de ejércitos que se propusieron **mutuamente en este mismo turno**
   (ver §6). Los eventos de diplomacia se emiten aquí, antes de recoger
   órdenes.
3. **Órdenes**: se llama a `agent.planTurn(view)` de todos los ejércitos
   (mismo snapshot de inicio de turno, ya reflejando las alianzas
   recién formadas/rotas en el paso 2). Se recogen todos los `OrderSet`
   antes de que ninguna unidad actúe.
4. **Movimiento**: cada unidad viva resuelve su orden concreta
   (`resolveOrder`, ver §5) y se desplaza hacia su destino hasta agotar su
   `move` de este turno. La distancia de parada depende de la orden:
   `Attack`/`Capture` paran al entrar en el propio `range`; `Defend` para a
   `GAME_CONFIG.formationSpacing` (26) de la unidad escoltada; `Move`/`Hold`
   no tienen destino de aproximación (`Hold` no se mueve).
5. **Combate** (daño simultáneo sobre HP "congelado"): para cada unidad viva,
   según su orden:
   - `Capture`: si el objetivo sigue vivo, es enemigo y quedó dentro de
     rango tras el movimiento, se tira la probabilidad de captura (§7) —
     **no inflige daño**, consume la acción de la unidad igualmente si falla.
   - `Move`: no ataca.
   - `Attack`/`Defend`/`Hold`: ataca al objetivo explícito (`Attack` con
     `targetId` válido y en rango) o, si no hay uno válido, al enemigo vivo
     más cercano dentro de su rango. El daño (§8) se acumula por objetivo sin
     restar aún del HP real (para permitir muertes mutuas).
   - **Traición**: si el atacante/capturador y el objetivo pertenecen a
     ejércitos actualmente aliados, el ataque **no se bloquea** — procede
     igual, pero rompe el pacto y cuenta como traición (§6).
6. **Resolución**: se aplica todo el daño acumulado del paso 5 a la vez. Las
   unidades cuyo HP llega a 0 mueren; se otorga XP a quien más daño individual
   aportó a esa muerte (§9); las capturas exitosas cambian el `armyId` de la
   unidad capturada (solo si sigue viva tras el combate de este turno).
7. **Condición de victoria** (§10): si se cumple, la partida pasa a
   `FINISHED` y se emite `FinishedEvent`.

## 4. Movimiento

Cada tipo de tropa tiene una velocidad `move` fija (no escala con el rango).
Una unidad con orden `Attack`/`Capture`/`Defend` se desplaza en línea recta
hacia su objetivo hasta `move` unidades de mundo, deteniéndose antes si ya
alcanzó la distancia de parada correspondiente (rango propio, o
`formationSpacing` para `Defend`). Con `Move` se desplaza hacia el punto
indicado. `Hold` no se desplaza.

## 5. Precedencia de órdenes (`resolveOrder`)

Un `OrderSet` puede dar órdenes a nivel de unidad concreta (`byUnit`), de
tipo de tropa (`byType`) o a todo el ejército (`global`). Para cada unidad se
aplica la primera que exista, en este orden:

```
byUnit[unitId]  >  byType[unitType]  >  global  >  Hold (por defecto)
```

Si no se especifica ninguna orden para una unidad, su comportamiento por
defecto es `Hold` (queda quieta y ataca lo que entre en su rango).

## 6. Diplomacia: alianzas y traición

- **Formar una alianza**: un agente emite `{ kind: "propose", withArmyId }`
  en `planDiplomacy`. La alianza se activa **solo si, en el mismo turno**,
  el otro ejército también propuso al primero (propuesta mutua y
  simultánea). Como `planDiplomacy` se reevalúa cada turno desde el estado
  actual, repetir la propuesta turno a turno es la forma normal de mantener
  la intención abierta hasta que el otro también proponga; no existe estado
  de "propuesta pendiente" — si un turno no se repite, se pierde.
- **Romper una alianza sin penalización**: `{ kind: "break", withArmyId }`.
  No cuenta como traición ni afecta a la reputación.
- **Traición**: atacar o intentar capturar a una unidad de un ejército
  actualmente aliado. El motor **nunca bloquea el ataque** — lo deja
  proceder con normalidad, pero automáticamente: rompe el pacto, incrementa
  `reputations[ejércitoTraidor]` en 1, y emite un `BetrayalEvent` (además del
  `attack`/`capture` correspondiente). La reputación es **acumulada y
  pública**: todos los agentes la ven en `view.reputations` (nº total de
  traiciones cometidas por cada ejército en toda la partida, no por
  relación).

## 7. Captura

`P(éxito) = clamp(0.5 + 0.25 × (rango_atacante − rango_objetivo), 0, 1)`

- Mismo rango → 50%.
- Cada rango de ventaja → +25 puntos porcentuales; cada rango de desventaja
  → −25.
- **+2 rangos de ventaja → éxito garantizado (100%)**. **−2 o peor →
  imposible (0%)**.
- Un intento de captura requiere que la unidad quede dentro de su propio
  rango de ataque del objetivo tras la fase de movimiento. Si tiene éxito, la
  unidad capturada cambia de bando inmediatamente (mismo turno, tras la fase
  de combate) y sigue viva con su HP actual. Si falla, no pasa nada más allá
  de haber consumido la acción de ese turno.

## 8. Daño

`damage = max(1, round(atk_efectivo × bonus_tipo + bonus_carga − armadura_objetivo))`

- `atk_efectivo` = ataque base del tipo escalado por rango:
  `round(baseAttack × STAT_MULTIPLIER[rango-1])`.
- `bonus_tipo`: multiplicador piedra-papel-tijera del atacante contra el tipo
  del objetivo (1 si no hay bonus definido; ver tabla en §11).
- `bonus_carga` = `chargeBonusPerDistance(tipo) × distancia_recorrida_este_turno`.
  Solo la Caballería tiene `chargeBonusPerDistance` distinto de 0 (0.003);
  el resto de tipos no reciben bonus por moverse.
- `armadura_objetivo` = armadura base del tipo (no escala con el rango).
- El daño mínimo es siempre **1**, sin importar cuánta armadura tenga el
  objetivo.

## 9. Experiencia y ascenso de rango

- Rematar a un enemigo otorga a la unidad que more daño individual aportó a
  esa muerte: `XP = coste_actual_de_la_víctima × XP_PER_KILL_COST_FACTOR`
  (`XP_PER_KILL_COST_FACTOR = 0.6`).
- El rango sube automáticamente en cuanto la XP acumulada alcanza el umbral
  del siguiente rango (`RANK_XP_THRESHOLD`, ver §11) — una unidad puede subir
  varios rangos de golpe si la XP ganada de una vez basta para varios
  umbrales.
- Al subir de rango, la unidad **no se cura del todo**: solo gana el
  incremento de HP máximo correspondiente al nuevo rango (`hp += nuevoMaxHp −
  antiguoMaxHp`), manteniendo el daño ya sufrido antes del ascenso.
- El rango máximo es 5; no hay más ascensos a partir de ahí.

## 10. Condiciones de victoria

Comprobadas al final de cada turno:

1. **Eliminación**: si queda ≤1 ejército con al menos una unidad viva, la
   partida termina inmediatamente. Con exactamente 1 superviviente, ese
   ejército gana. Con 0 (aniquilación mutua en el mismo turno), es
   **empate** (`winner = null`).
2. **Límite de turnos**: si se alcanza `maxTurns` (30) y quedan ≥2 ejércitos
   vivos, la partida termina y gana el de **mayor valor de ejército**:
   `armyValue = Σ (coste_actual(unidad) × hp_actual/hp_máximo)` sobre las
   unidades vivas. **Si dos o más ejércitos empatan en el valor máximo, es
   empate** (`winner = null`) — no hay desempate secundario.

## 11. Tablas de referencia (valores actuales)

### Constantes globales — `src/config/game.ts`

| Constante | Valor |
|---|---|
| `budget` | 1600 |
| `maxTurns` | 30 |
| `fieldSize` | 1200 (campo cuadrado, unidades de mundo) |
| `minArmies` / `defaultArmies` / `maxArmies` | 2 / 4 / 6 |
| `spawnRadiusFactor` | 0.82 |
| `formationSpacing` | 26 |
| `XP_PER_KILL_COST_FACTOR` | 0.6 |

### Escalado por rango — `src/config/ranks.ts` (índice = rango−1)

| Rango | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| `STAT_MULTIPLIER` (hp/atk) | 1.0 | 1.35 | 1.8 | 2.4 | 3.2 |
| `COST_MULTIPLIER` | 1.0 | 1.7 | 2.7 | 4.0 | 5.6 |
| `RANK_XP_THRESHOLD` (XP acumulada para llegar a ese rango) | 0 | 10 | 25 | 50 | 90 |

`move` y `armor` **no escalan con el rango** (siempre el valor base del
tipo). `range` escala distinto según el tipo: constante para las tropas
cuerpo a cuerpo, creciente (con `STAT_MULTIPLIER`) para el arquero — ver
tabla siguiente.

### Tipos de tropa (rango 1) — `src/config/units.ts`

| Tipo | Forma | HP | Atq | Mov | Armor | Coste | Rango (por rango 1-5) | Especial |
|---|---|---|---|---|---|---|---|---|
| Arquero (`ARCHER`) | triángulo | 17 | 4 | 197 | 0 | 12 | 240 / 324 / 432 / 576 / 768 | +50% daño vs Pesada |
| Inf. ligera (`LIGHT`) | círculo | 21 | 3 | 300 | 0 | 6 | 19 (constante) | +25% daño vs Arquero |
| Inf. pesada (`HEAVY`) | cuadrado | 43 | 5 | 120 | 2 | 15 | 19 (constante) | +50% daño vs Caballería |
| Caballería (`CAVALRY`) | rombo | 30 | 7 | 600 | 1 | 20 | 19 (constante) | +50% vs Arquero y Ligera; `chargeBonusPerDistance=0.003` |

El rango de las tropas cuerpo a cuerpo (19) es la distancia de contacto de
hitbox: la suma de los radios visuales de dos unidades en el canvas actual
(ver comentario en `src/config/units.ts` si cambia el tamaño de render).

### Bonus de tipo (piedra-papel-tijera) — `damageBonusVs`

| Atacante ↓ / Objetivo → | Arquero | Ligera | Pesada | Caballería |
|---|---|---|---|---|
| Arquero | — | — | ×1.5 | — |
| Ligera | ×1.25 | — | — | — |
| Pesada | — | — | — | ×1.5 |
| Caballería | ×1.5 | ×1.5 | — | — |

Cualquier combinación no listada usa el multiplicador neutro ×1.
