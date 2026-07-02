# Contratos de agente

Todo jugador (humano por proxy de una IA estática, heurística, de utilidad, o
en el futuro un LLM) se conecta al motor implementando **una única interfaz**:
[`Agent`](../src/agents/Agent.ts). El motor (`GameEngine`) no conoce ninguna
implementación concreta — solo llama a los métodos de esta interfaz en los
momentos descritos abajo. Esto es el **patrón estrategia**: cualquier clase
que implemente `Agent` es intercambiable sin tocar el motor ni el render.

Para las reglas/fórmulas que estos contratos exponen, ver
[`docs/GAME_RULES.md`](./GAME_RULES.md). Para el prompt de sistema de un
agente LLM (que consume una versión JSON de estos mismos contratos), ver
[`docs/AGENT_PROMPT.md`](./AGENT_PROMPT.md).

## Ciclo de vida de un `Agent`

```
Fase de preparación:
  1×  buildArmy(ArmyBuildContext)      → ArmyBlueprint
  1×  onBattleStart?(BattlefieldView)  → void          (opcional)

Fase de batalla, repetido cada turno (hasta maxTurns o victoria):
  1×  planDiplomacy?(BattlefieldView)  → DiplomacyIntent[]  (opcional)
  1×  planTurn(BattlefieldView)        → OrderSet
```

```ts
// src/agents/Agent.ts
export interface Agent {
  readonly name: string;
  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint;
  onBattleStart?(view: BattlefieldView): void;
  planTurn(view: BattlefieldView): OrderSet;
  planDiplomacy?(view: BattlefieldView): DiplomacyIntent[];
}
```

Todos los métodos son **síncronos** — el motor llama a todos los agentes
seguidos, sobre el mismo snapshot de estado, dentro del mismo `tick()`. Esto
implica que hoy **no se puede conectar directamente un agente que necesite
hacer una llamada de red asíncrona** (p. ej. a una API de LLM) sin antes
adaptar el motor (ver "Fuera de alcance" en `AGENT_PROMPT.md`).

---

## 1. `buildArmy` — fase de preparación

```ts
buildArmy(ctx: ArmyBuildContext): ArmyBlueprint
```

### Entrada: `ArmyBuildContext`

```ts
export interface ArmyBuildContext {
  readonly budget: number;
  readonly selfArmyId: ArmyId;
  readonly armyCount: number;
  readonly fieldSize: number;
  readonly rng: Rng;
  costOf(type: UnitType, rank: Rank): number;
  statsOf(type: UnitType, rank: Rank): Stats;
}
```

- `budget`: puntos disponibles para este ejército (1600 por defecto).
- `costOf`/`statsOf`: consulta el coste/stats exactos de cualquier
  combinación tipo+rango — úsalo en vez de recalcular las fórmulas de
  `docs/GAME_RULES.md` a mano.
- `rng`: generador semillado propio de este ejército (mismo flujo reutilizado
  en `onBattleStart`/`planDiplomacy`/`planTurn` durante toda la partida —
  determinista si el motor se construyó con semilla fija).

### Salida: `ArmyBlueprint`

```ts
export interface BlueprintEntry {
  type: UnitType;   // ARCHER | LIGHT | HEAVY | CAVALRY
  rank: Rank;        // 1 | 2 | 3 | 4 | 5
}
export type ArmyBlueprint = BlueprintEntry[];
```

Una lista de unidades a crear. **El motor valida el presupuesto por ti**:
recorre la lista en orden y acepta entradas mientras quepan en lo que queda
de `budget`; las que no quepan se descartan sin error. No hace falta (ni es
posible) sobrepasar el presupuesto — pero tampoco hace falta gastarlo
exactamente: lo no gastado simplemente no se convierte en unidades.

---

## 2. `onBattleStart` — análisis previo (opcional)

```ts
onBattleStart?(view: BattlefieldView): void
```

Se llama una única vez, tras desplegarse todos los ejércitos y antes del
turno 1, con la `BattlefieldView` inicial completa (ver §4). Es el momento de
fijar una estrategia general/perfil interno antes de que empiece el combate.
No devuelve nada — es puramente para que el agente inicialice su propio
estado interno (si lo tiene).

---

## 3. `planDiplomacy` — intenciones diplomáticas (opcional, por turno)

```ts
planDiplomacy?(view: BattlefieldView): DiplomacyIntent[]
```

```ts
// src/domain/diplomacy.ts
export interface ProposeAllianceIntent {
  kind: "propose";
  withArmyId: ArmyId;
}
export interface BreakAllianceIntent {
  kind: "break";
  withArmyId: ArmyId;
}
export type DiplomacyIntent = ProposeAllianceIntent | BreakAllianceIntent;
```

Se puede devolver cualquier número de intenciones (una por ejército objetivo
como máximo tiene sentido; duplicados hacia el mismo `withArmyId` no aportan
nada). Ver §6 de `GAME_RULES.md` para la regla exacta de cuándo se forma una
alianza (propuesta mutua en el mismo turno) y qué pasa si se ataca a un
aliado (traición automática, sin bloqueo del motor).

Devolver `[]` (o no implementar el método) equivale a no tener intenciones
diplomáticas ese turno — no retira alianzas existentes.

---

## 4. `planTurn` — órdenes de combate (obligatorio, cada turno)

```ts
planTurn(view: BattlefieldView): OrderSet
```

### Entrada: `BattlefieldView`

Instantánea de solo lectura del campo completo. **Información perfecta**: se
ven todas las unidades vivas de todos los ejércitos, no solo las propias.

```ts
export interface UnitView {
  readonly id: UnitId;
  readonly type: UnitType;
  readonly armyId: ArmyId;
  readonly rank: Rank;
  readonly pos: Vec2;            // { x, y }
  readonly hp: number;
  readonly maxHp: number;
  readonly stats: Stats;          // { maxHp, attack, range, move, armor } ya escalados por rango
  readonly cost: number;          // coste actual (según rango actual)
  readonly hpFrac: number;        // hp / maxHp, ya calculado
}

export interface BattlefieldView {
  readonly turn: number;
  readonly maxTurns: number;
  readonly fieldSize: number;
  readonly selfArmyId: ArmyId;
  readonly units: readonly UnitView[];   // TODAS las unidades vivas, de todos los ejércitos
  readonly rng: Rng;
  readonly alliances: ReadonlyArray<readonly [ArmyId, ArmyId]>;
  readonly reputations: Readonly<Record<ArmyId, number>>;  // traiciones acumuladas por ejército

  own(): UnitView[];       // this.units filtradas a selfArmyId
  enemies(): UnitView[];   // this.units filtradas a !== selfArmyId
  armyStrength(armyId: ArmyId): number;   // Σ coste×hpFrac de las unidades vivas de ese ejército
  unitCount(armyId: ArmyId): number;
  nearestEnemyTo(pos: Vec2): UnitView | null;
  nearestAllyTo(pos: Vec2, excludeId?: UnitId): UnitView | null;
}
```

Notas importantes:
- Solo aparecen unidades **vivas**. Una unidad muerta desaparece de `units`
  el turno en que muere.
- `armyStrength`/`unitCount` se calculan **una vez al principio del turno**
  (antes de diplomacia/órdenes) — no reflejan cambios de este mismo turno
  todavía.
- `alliances`/`reputations` sí reflejan los cambios de diplomacia de este
  mismo turno (la fase de diplomacia se resuelve antes de llamar a
  `planTurn`).
- Tras una captura, la unidad capturada aparece con su `armyId` actualizado
  (el nuevo dueño) desde el turno siguiente en que se resolvió la captura.

### Salida: `OrderSet`

```ts
export interface OrderSet {
  global?: Order;
  byType?: Partial<Record<UnitType, Order>>;
  byUnit?: Record<UnitId, Order>;
}
```

Tres niveles de alcance, resueltos por unidad con precedencia
**`byUnit` > `byType` > `global`** (`resolveOrder`, `src/orders/orders.ts`).
Si ninguno aplica a una unidad, su orden por defecto es `HoldOrder`. No hace
falta dar una orden a cada unidad individualmente: un `global` cubre a todo
el ejército, y `byUnit`/`byType` solo hacen falta para excepciones.

### Las 5 órdenes posibles (`src/orders/orders.ts`)

```ts
export enum OrderType {
  Attack = "ATTACK",
  Move = "MOVE",
  Defend = "DEFEND",
  Capture = "CAPTURE",
  Hold = "HOLD",
}

/** Ataca a `targetId` si sigue siendo válido y queda en rango; si no,
 *  ataca al enemigo vivo más cercano dentro de su rango. Se desplaza hasta
 *  quedar en rango del objetivo antes de golpear. */
export interface AttackOrder {
  kind: OrderType.Attack;
  targetId?: UnitId;   // opcional: si se omite, se elige el objetivo automáticamente
}

/** Se desplaza en línea recta hacia `to` hasta agotar su movimiento. No ataca. */
export interface MoveOrder {
  kind: OrderType.Move;
  to: Vec2;
}

/** Se desplaza hacia la unidad aliada `allyId` (distancia de parada:
 *  GAME_CONFIG.formationSpacing) y ataca a quien entre en su rango desde ahí. */
export interface DefendOrder {
  kind: OrderType.Defend;
  allyId: UnitId;
}

/** Intenta capturar a `targetId` (debe ser enemigo). Se desplaza hasta
 *  quedar en rango; si lo logra, tira la probabilidad de captura en vez de
 *  hacer daño. Ver fórmula en GAME_RULES.md §7. */
export interface CaptureOrder {
  kind: OrderType.Capture;
  targetId: UnitId;
}

/** No se mueve. Ataca a quien entre en su rango desde su posición actual. */
export interface HoldOrder {
  kind: OrderType.Hold;
}

export type Order = AttackOrder | MoveOrder | DefendOrder | CaptureOrder | HoldOrder;
```

### Ejemplo de `OrderSet`

```ts
{
  // Por defecto, todo el ejército ataca al enemigo más cercano en rango.
  global: { kind: OrderType.Attack },

  // Los arqueros, en concreto, se mantienen quietos y disparan a lo que entre en rango
  // (útil si su rango ya cubre gran parte del mapa y no conviene que avancen).
  byType: {
    [UnitType.Archer]: { kind: OrderType.Hold },
  },

  // Una unidad concreta se retira hacia la esquina superior izquierda.
  byUnit: {
    "a0-u17": { kind: OrderType.Move, to: { x: 50, y: 50 } },
  },
}
```

---

## 5. Eventos del motor (`GameEvent`, `src/engine/events.ts`)

Cada `tick()` del motor devuelve, entre otras cosas, la lista de eventos
ocurridos ese turno. Los agentes **no reciben esto directamente** (no forma
parte de `BattlefieldView`) — es para el log/render — pero documentarlo aquí
es útil porque el efecto de cada evento SÍ se refleja en la siguiente
`BattlefieldView` (unidad desaparecida, `armyId` cambiado, `reputations`
actualizada, etc.).

```ts
export type GameEvent =
  | TurnEvent            // { kind: "turn"; turn: number }
  | AttackEvent           // { kind: "attack"; attackerId; targetId; damage }
  | KillEvent             // { kind: "kill"; killerId: UnitId | null; victimId }
  | CaptureEvent          // { kind: "capture"; captorId; victimId; success; probability }
  | RankUpEvent           // { kind: "rankup"; unitId; newRank }
  | AllianceFormedEvent   // { kind: "alliance-formed"; a; b; turn }
  | AllianceBrokenEvent   // { kind: "alliance-broken"; a; b }
  | BetrayalEvent         // { kind: "betrayal"; betrayerArmyId; victimArmyId; unitId; targetId }
  | FinishedEvent;        // { kind: "finished"; winner: ArmyId | null; turn }
```

---

## 6. Registrar un nuevo `Agent`

`src/agents/index.ts` mantiene `AGENT_REGISTRY: Record<string, AgentFactory>`
(`AgentFactory = () => Agent`). Añadir una implementación nueva es tan simple
como registrar su fábrica:

```ts
export const AGENT_REGISTRY: Record<string, AgentFactory> = {
  utility: () => new UtilityAgent(),
  balanced: () => new HeuristicAgent("balanced"),
  // ...
  "mi-agente": () => new MiAgentePersonalizado(),
};
```

`defaultAgentFor(index)` decide qué agente usa cada ejército por defecto en
`Simulation.ts`. Ninguna parte del motor, del render ni de la UI necesita
cambiar para soportar un `Agent` nuevo — es exactamente el punto del patrón
estrategia.

---

## 7. Implementaciones existentes (referencia)

| Agente | Fichero | Naturaleza |
|---|---|---|
| `HeuristicAgent` | `src/agents/HeuristicAgent.ts` | Doctrinas fijas con nombre (balanced/cavalry/ranged), heurísticas simples y deterministas. Ya no es el agente por defecto, pero se mantiene para tests. |
| `UtilityAgent` | `src/agents/UtilityAgent.ts` | Agente por defecto. Perfil numérico persistente sin doctrinas con nombre, agrupamiento táctico, diplomacia. |
| `MockLlmAgent` | `src/agents/llm/MockLlmAgent.ts` | Implementa `Agent` de forma síncrona pero pasa por el mismo pipeline de prompt/DTO/parseo que usaría un LLM real, con una respuesta simulada en vez de una llamada de red. Ver `docs/AGENT_PROMPT.md`. |
