import type { Agent, ArmyBuildContext } from "../agents/Agent.ts";
import type { BattlefieldView, UnitView } from "../agents/Agent.ts";
import { UNIT_DEFS } from "../config/units.ts";
import { GAME_CONFIG, XP_PER_KILL_COST_FACTOR } from "../config/game.ts";
import { costMultiplier, statMultiplier } from "../config/ranks.ts";
import { armyValue } from "../domain/Army.ts";
import { Army } from "../domain/Army.ts";
import {
  areAllied,
  isProtected,
  pairKey,
  resolveDiplomacy,
  type DiplomacyIntent,
} from "../domain/diplomacy.ts";
import { GameState } from "../domain/GameState.ts";
import { Unit } from "../domain/Unit.ts";
import {
  Phase,
  type ArmyId,
  type Rank,
  type UnitId,
  type UnitType,
  type Vec2,
} from "../domain/types.ts";
import { OrderType, resolveOrder, type Order, type OrderSet } from "../orders/orders.ts";
import { ARMY_COLORS } from "../render/palette.ts";
import { captureProbability, computeDamage } from "./combat.ts";
import { distance } from "./geometry.ts";
import { formationPositions, spawnCenters } from "./geometry.ts";
import type { GameEvent } from "./events.ts";
import { desiredDestination, moveToward, nearestEnemy } from "./movement.ts";
import { createRng, type Rng } from "./rng.ts";

/** Agregados por ejército calculados una vez por turno (evita recomputarlos por agente). */
interface ArmyAggregates {
  strength: Map<ArmyId, number>;
  count: Map<ArmyId, number>;
}

export interface EngineConfig {
  armyCount: number;
  budget: number;
  maxTurns: number;
  fieldSize: number;
  seed?: number;
}

export interface TurnResult {
  turn: number;
  events: GameEvent[];
  /** Posiciones de cada unidad ANTES de la fase de movimiento (para animar). */
  startPositions: Map<UnitId, Vec2>;
  /** Orden resuelta que ejecutó cada unidad viva este turno (para animar el estado: ataque/movimiento/reposo). */
  unitActions: Map<UnitId, OrderType>;
}

/**
 * Motor de la partida. Orquesta la preparación y la fase de batalla por fases
 * (mover → combatir) con daño simultáneo. No conoce a ninguna IA concreta:
 * solo la interfaz Agent.
 */
export class GameEngine {
  readonly state = new GameState();
  private readonly agents: Agent[];
  private readonly cfg: EngineConfig;
  private readonly rng: Rng;
  /** RNG semillado propio de cada ejército, derivado del RNG del motor. */
  private readonly armyRng: Rng[];
  /** Índice unidad→objeto, reconstruido al inicio de cada tick (evita O(n) por búsqueda a gran escala). */
  private unitIndex = new Map<UnitId, Unit>();
  private nextUnitSeq = 0;

  constructor(agents: Agent[], config?: Partial<EngineConfig>) {
    this.cfg = {
      armyCount: config?.armyCount ?? agents.length,
      budget: config?.budget ?? GAME_CONFIG.budget,
      maxTurns: config?.maxTurns ?? GAME_CONFIG.maxTurns,
      fieldSize: config?.fieldSize ?? GAME_CONFIG.fieldSize,
      seed: config?.seed,
    };
    this.agents = agents.slice(0, this.cfg.armyCount);
    this.rng = createRng(this.cfg.seed);
    this.armyRng = this.agents.map(() => createRng(this.rng.int(0, 0x7fffffff)));
  }

  /** Fase de preparación: cada agente forma su ejército y se despliega. */
  setup(): void {
    const centers = spawnCenters(
      this.agents.length,
      this.cfg.fieldSize,
      GAME_CONFIG.spawnRadiusFactor,
    );

    this.agents.forEach((agent, i) => {
      const armyId: ArmyId = i;
      const army = new Army(armyId, agent.name, ARMY_COLORS[i % ARMY_COLORS.length]);
      this.state.armies.push(army);

      const blueprint = agent.buildArmy(this.buildContext(armyId));

      // Valida el presupuesto: descarta entradas que se pasen del límite.
      const accepted: Array<{ type: UnitType; rank: Rank }> = [];
      let spent = 0;
      for (const entry of blueprint) {
        const cost = this.costOf(entry.type, entry.rank);
        if (spent + cost <= this.cfg.budget) {
          accepted.push(entry);
          spent += cost;
        }
      }

      const positions = formationPositions(
        centers[i],
        accepted.length,
        GAME_CONFIG.formationSpacing,
        this.cfg.fieldSize,
      );
      accepted.forEach((entry, k) => {
        this.state.units.push(
          new Unit({
            id: `a${armyId}-u${this.nextUnitSeq++}`,
            type: entry.type,
            armyId,
            rank: entry.rank,
            pos: positions[k],
          }),
        );
      });
    });

    // Análisis previo del campo por cada agente.
    this.unitIndex = new Map(this.state.units.map((u) => [u.id, u]));
    const aggregates = this.computeArmyAggregates();
    this.agents.forEach((agent, i) => {
      agent.onBattleStart?.(this.viewFor(i, aggregates));
    });

    this.state.phase = Phase.Battle;
    this.state.turn = 0;
  }

  /** Avanza un turno completo de la fase de batalla. */
  tick(): TurnResult {
    const events: GameEvent[] = [];
    const startPositions = new Map<UnitId, Vec2>();
    for (const u of this.state.units) {
      if (u.alive) startPositions.set(u.id, { ...u.pos });
    }

    const unitActions = new Map<UnitId, OrderType>();

    if (this.state.finished) {
      return { turn: this.state.turn, events, startPositions, unitActions };
    }

    this.unitIndex = new Map(this.state.units.map((u) => [u.id, u]));
    this.state.turn += 1;
    events.push({ kind: "turn", turn: this.state.turn });

    const aggregates = this.computeArmyAggregates();

    // 0. Diplomacia: cada ejército propone/rompe alianzas sobre el estado de
    // inicio de turno; se resuelve antes de recoger órdenes para que la
    // exclusión de objetivos aliados vea los pactos ya formados este turno.
    const diplomacyIntents = new Map<ArmyId, DiplomacyIntent[]>();
    this.agents.forEach((agent, i) => {
      diplomacyIntents.set(i, agent.planDiplomacy?.(this.viewFor(i, aggregates)) ?? []);
    });
    events.push(...resolveDiplomacy(diplomacyIntents, this.state));

    // 1. Recoger órdenes de todos los agentes sobre el mismo estado inicial.
    const orderSets = new Map<ArmyId, OrderSet>();
    this.agents.forEach((agent, i) => {
      orderSets.set(i, agent.planTurn(this.viewFor(i, aggregates)));
    });
    const orderOf = (u: Unit): Order =>
      resolveOrder(orderSets.get(u.armyId) ?? {}, u.id, u.type);

    // 1.5 Neutraliza a Hold las órdenes de Attack/Capture cuyo objetivo explícito
    // sea un aliado dentro de su ventana de protección (recién formada esta
    // misma ronda o de un turno anterior): la unidad reacciona con normalidad
    // a cualquier OTRO enemigo válido en rango en vez de marchar hacia su
    // aliado o quedarse congelada.
    for (const u of this.state.units) {
      if (!u.alive) continue;
      const order = orderOf(u);
      if (order.kind !== OrderType.Attack && order.kind !== OrderType.Capture) continue;
      const targetId = order.targetId;
      if (!targetId) continue;
      const target = this.unitById(targetId);
      if (!target || target.armyId === u.armyId) continue;
      if (!isProtected(this.state, u.armyId, target.armyId)) continue;
      const set = orderSets.get(u.armyId) ?? {};
      set.byUnit = { ...set.byUnit, [u.id]: { kind: OrderType.Hold } };
      orderSets.set(u.armyId, set);
    }

    // 2. Fase de movimiento.
    for (const u of this.state.units) {
      if (!u.alive) continue;
      u.distanceMovedThisTurn = 0;
      const order = orderOf(u);
      unitActions.set(u.id, order.kind);
      const dest = desiredDestination(u, order, this.state.units);
      if (!dest) continue;
      const stopWithin = this.stopDistanceFor(u, order);
      moveToward(u, dest, this.cfg.fieldSize, stopWithin);
    }

    // 3. Fase de combate: daño simultáneo sobre HP congelado.
    const incoming = new Map<UnitId, { total: number; byAttacker: Map<UnitId, number> }>();
    const addDamage = (target: Unit, attacker: Unit, dmg: number) => {
      const entry = incoming.get(target.id) ?? { total: 0, byAttacker: new Map() };
      entry.total += dmg;
      entry.byAttacker.set(attacker.id, (entry.byAttacker.get(attacker.id) ?? 0) + dmg);
      incoming.set(target.id, entry);
    };

    const captureAttempts: Array<{ captor: Unit; target: Unit; p: number; success: boolean }> = [];

    for (const u of this.state.units) {
      if (!u.alive) continue;
      const order = orderOf(u);

      if (order.kind === OrderType.Capture) {
        const target = this.unitById(order.targetId);
        if (
          target &&
          target.alive &&
          target.armyId !== u.armyId &&
          !isProtected(this.state, u.armyId, target.armyId)
        ) {
          if (distance(u.pos, target.pos) <= u.stats().range) {
            this.maybeBetray(u.armyId, target.armyId, u.id, target.id, events);
            const p = captureProbability(u.rank, target.rank);
            const success = this.rng.chance(p);
            captureAttempts.push({ captor: u, target, p, success });
            events.push({
              kind: "capture",
              captorId: u.id,
              victimId: target.id,
              success,
              probability: p,
            });
          }
        }
        continue; // capturar consume la acción: no hace daño.
      }

      if (order.kind === OrderType.Move) continue; // moverse no ataca.

      const target = this.attackTargetFor(u, order);
      if (target) {
        this.maybeBetray(u.armyId, target.armyId, u.id, target.id, events);
        const dmg = computeDamage(u, target);
        addDamage(target, u, dmg);
        events.push({ kind: "attack", attackerId: u.id, targetId: target.id, damage: dmg });
      }
    }

    // 4. Resolución: aplicar daño, muertes, XP y capturas.
    for (const [targetId, entry] of incoming) {
      const target = this.unitById(targetId);
      if (!target || !target.alive) continue;
      const wasAlive = target.alive;
      target.hp -= entry.total;
      if (wasAlive && target.hp <= 0) {
        target.hp = 0;
        const killerId = this.topAttacker(entry.byAttacker);
        const killer = killerId ? this.unitById(killerId) : null;
        events.push({ kind: "kill", killerId: killerId, victimId: target.id });
        if (killer && killer.alive) {
          const gained = killer.gainXp(target.cost() * XP_PER_KILL_COST_FACTOR);
          if (gained > 0) {
            events.push({ kind: "rankup", unitId: killer.id, newRank: killer.rank });
          }
        }
      }
    }

    // Capturas: sólo sobre unidades que siguen vivas tras el combate.
    for (const attempt of captureAttempts) {
      if (attempt.success && attempt.target.alive) {
        attempt.target.armyId = attempt.captor.armyId;
      }
    }

    // 5. Condición de victoria.
    this.checkVictory(events);

    return { turn: this.state.turn, events, startPositions, unitActions };
  }

  // --- Helpers de combate/movimiento ---

  private stopDistanceFor(u: Unit, order: Order): number {
    switch (order.kind) {
      case OrderType.Attack:
      case OrderType.Capture:
        return u.stats().range;
      case OrderType.Defend:
        return GAME_CONFIG.formationSpacing;
      default:
        return 0;
    }
  }

  /** Objetivo al que golpea una unidad tras moverse, si hay alguno en rango. */
  private attackTargetFor(u: Unit, order: Order): Unit | null {
    const range = u.stats().range;
    const inRange = (t: Unit) =>
      t.alive &&
      t.armyId !== u.armyId &&
      distance(u.pos, t.pos) <= range &&
      !isProtected(this.state, u.armyId, t.armyId);

    if (order.kind === OrderType.Attack && order.targetId) {
      const explicit = this.unitById(order.targetId);
      if (explicit && inRange(explicit)) return explicit;
    }
    // Defend/Hold/Attack sin objetivo válido: golpea al enemigo más cercano en rango.
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const t of this.state.units) {
      if (!inRange(t)) continue;
      const d = distance(u.pos, t.pos);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private topAttacker(byAttacker: Map<UnitId, number>): UnitId | null {
    let best: UnitId | null = null;
    let bestDmg = -1;
    for (const [id, dmg] of byAttacker) {
      if (dmg > bestDmg) {
        bestDmg = dmg;
        best = id;
      }
    }
    return best;
  }

  private checkVictory(events: GameEvent[]): void {
    const living = this.state.livingArmyIds();
    let finished = false;
    let winner: ArmyId | null = null;

    if (living.length <= 1) {
      finished = true;
      winner = living[0] ?? null;
    } else if (this.state.turn >= this.cfg.maxTurns) {
      finished = true;
      winner = this.winnerByValue(living);
    }

    if (finished) {
      this.state.finished = true;
      this.state.winner = winner;
      this.state.phase = Phase.Finished;
      events.push({ kind: "finished", winner, turn: this.state.turn });
    }
  }

  /** Ejército con mayor valor restante; null si hay empate en el máximo. */
  private winnerByValue(living: ArmyId[]): ArmyId | null {
    let best: ArmyId | null = null;
    let bestValue = -1;
    let tie = false;
    for (const id of living) {
      const v = armyValue(this.state.units, id);
      if (v > bestValue) {
        bestValue = v;
        best = id;
        tie = false;
      } else if (v === bestValue) {
        tie = true;
      }
    }
    return tie ? null : best;
  }

  // --- Diplomacia ---

  /**
   * Si el atacante y el objetivo pertenecen a ejércitos actualmente aliados,
   * el motor no bloquea el ataque pero rompe el pacto, sube la cuenta de
   * traiciones del atacante y emite el evento `betrayal`.
   */
  private maybeBetray(
    attackerArmyId: ArmyId,
    defenderArmyId: ArmyId,
    unitId: UnitId,
    targetId: UnitId,
    events: GameEvent[],
  ): void {
    if (attackerArmyId === defenderArmyId) return;
    if (!areAllied(this.state, attackerArmyId, defenderArmyId)) return;
    this.state.alliances.delete(pairKey(attackerArmyId, defenderArmyId));
    this.state.betrayalCounts[attackerArmyId] =
      (this.state.betrayalCounts[attackerArmyId] ?? 0) + 1;
    events.push({
      kind: "betrayal",
      betrayerArmyId: attackerArmyId,
      victimArmyId: defenderArmyId,
      unitId,
      targetId,
    });
  }

  // --- Utilidades ---

  private unitById(id: UnitId): Unit | undefined {
    return this.unitIndex.get(id);
  }

  private costOf(type: UnitType, rank: Rank): number {
    return Math.ceil(UNIT_DEFS[type].baseCost * costMultiplier(rank));
  }

  /** Fuerza (valor total) y nº de unidades vivas por ejército, calculado una vez por turno. */
  private computeArmyAggregates(): ArmyAggregates {
    const strength = new Map<ArmyId, number>();
    const count = new Map<ArmyId, number>();
    for (const u of this.state.units) {
      if (!u.alive) continue;
      strength.set(u.armyId, (strength.get(u.armyId) ?? 0) + u.value());
      count.set(u.armyId, (count.get(u.armyId) ?? 0) + 1);
    }
    return { strength, count };
  }

  private buildContext(armyId: ArmyId) {
    return {
      budget: this.cfg.budget,
      selfArmyId: armyId,
      armyCount: this.agents.length,
      fieldSize: this.cfg.fieldSize,
      rng: this.armyRng[armyId],
      costOf: (type: UnitType, rank: Rank) => this.costOf(type, rank),
      statsOf: (type: UnitType, rank: Rank) => {
        const def = UNIT_DEFS[type];
        const m = statMultiplier(rank);
        return {
          maxHp: Math.round(def.baseStats.maxHp * m),
          attack: Math.round(def.baseStats.attack * m),
          range: def.rangeByRank[rank - 1],
          move: def.baseStats.move,
          armor: def.baseStats.armor,
        };
      },
    };
  }

  /** Construye la vista de solo lectura del campo desde la óptica de un ejército. */
  /** Vista del campo desde la óptica del ejército `armyId` con el estado actual (para prefetch LLM). */
  createViewFor(armyId: ArmyId): BattlefieldView {
    return this.viewFor(armyId, this.computeArmyAggregates());
  }

  /** Contexto de construcción para el ejército `armyId` (puede llamarse antes de setup). */
  createBuildContextFor(armyId: ArmyId): ArmyBuildContext {
    return this.buildContext(armyId);
  }

  private viewFor(selfArmyId: ArmyId, aggregates: ArmyAggregates): BattlefieldView {
    const units: UnitView[] = this.state.units
      .filter((u) => u.alive)
      .map((u) => ({
        id: u.id,
        type: u.type,
        armyId: u.armyId,
        rank: u.rank,
        pos: { ...u.pos },
        hp: u.hp,
        maxHp: u.stats().maxHp,
        stats: u.stats(),
        cost: u.cost(),
        hpFrac: u.hp / u.stats().maxHp,
      }));
    const cfg = this.cfg;
    const alliances: Array<readonly [ArmyId, ArmyId]> = [...this.state.alliances.keys()].map((key) => {
      const [a, b] = key.split(":").map(Number);
      return [a, b] as const;
    });
    const reputations: Record<ArmyId, number> = { ...this.state.betrayalCounts };
    return {
      turn: this.state.turn,
      maxTurns: cfg.maxTurns,
      fieldSize: cfg.fieldSize,
      selfArmyId,
      units,
      rng: this.armyRng[selfArmyId],
      alliances,
      reputations,
      own() {
        return this.units.filter((u) => u.armyId === selfArmyId);
      },
      enemies() {
        return this.units.filter((u) => u.armyId !== selfArmyId);
      },
      armyStrength(armyId: ArmyId) {
        return aggregates.strength.get(armyId) ?? 0;
      },
      unitCount(armyId: ArmyId) {
        return aggregates.count.get(armyId) ?? 0;
      },
      nearestEnemyTo(pos) {
        return nearestInList(pos, this.enemies());
      },
      nearestAllyTo(pos, excludeId) {
        const candidates = this.own().filter((u) => u.id !== excludeId);
        return nearestInList(pos, candidates);
      },
    };
  }
}

function nearestInList(pos: Vec2, list: UnitView[]): UnitView | null {
  let best: UnitView | null = null;
  let bestDist = Infinity;
  for (const u of list) {
    const d = Math.hypot(u.pos.x - pos.x, u.pos.y - pos.y);
    if (d < bestDist) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

// Reexport puntual usado por heurísticas externas (evita import directo del engine).
export { nearestEnemy };
