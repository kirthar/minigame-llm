import { describe, expect, it } from "vitest";
import { HeuristicAgent } from "../src/agents/HeuristicAgent.ts";
import { GameEngine } from "../src/engine/GameEngine.ts";
import { UNIT_DEFS } from "../src/config/units.ts";
import { costMultiplier, statMultiplier } from "../src/config/ranks.ts";
import type {
  Agent,
  ArmyBlueprint,
  ArmyBuildContext,
  BattlefieldView,
} from "../src/agents/Agent.ts";
import { OrderType, resolveOrder, type OrderSet } from "../src/orders/orders.ts";
import type { Rank, Stats, UnitType } from "../src/domain/types.ts";
import { createRng } from "../src/engine/rng.ts";

const BUDGET = 100;

function ctx(): ArmyBuildContext {
  return {
    budget: BUDGET,
    selfArmyId: 0,
    armyCount: 2,
    fieldSize: 720,
    rng: createRng(1),
    costOf: (t: UnitType, r: Rank) => Math.ceil(UNIT_DEFS[t].baseCost * costMultiplier(r)),
    statsOf: (t: UnitType, r: Rank): Stats => {
      const def = UNIT_DEFS[t];
      const m = statMultiplier(r);
      return {
        maxHp: def.baseStats.maxHp * m,
        attack: def.baseStats.attack * m,
        range: def.rangeByRank[r - 1],
        move: def.baseStats.move,
        armor: def.baseStats.armor,
      };
    },
  };
}

describe("HeuristicAgent.buildArmy", () => {
  for (const doctrine of ["balanced", "cavalry", "ranged"] as const) {
    it(`respeta el presupuesto (${doctrine})`, () => {
      const agent = new HeuristicAgent(doctrine);
      const blueprint = agent.buildArmy(ctx());
      const spent = blueprint.reduce(
        (s, e) => s + Math.ceil(UNIT_DEFS[e.type].baseCost * costMultiplier(e.rank)),
        0,
      );
      expect(blueprint.length).toBeGreaterThan(0);
      expect(spent).toBeLessThanOrEqual(BUDGET);
    });
  }
});

describe("HeuristicAgent.planTurn", () => {
  it("emite una orden válida por cada unidad propia", () => {
    const engine = new GameEngine([new HeuristicAgent(), new HeuristicAgent()], { seed: 9 });
    engine.setup();
    const agent = new HeuristicAgent();
    // Reconstruye una vista desde el estado del motor para el ejército 0.
    engine.tick(); // asegura que hay enemigos y estado avanzado
    const own = engine.state.units.filter((u) => u.alive && u.armyId === 0);
    // Vista mínima compatible con la interfaz.
    const view = makeView(engine, 0);
    const set = agent.planTurn(view);
    const validKinds = new Set(Object.values(OrderType));
    for (const u of own) {
      const order = resolveOrder(set, u.id, u.type);
      expect(validKinds.has(order.kind)).toBe(true);
    }
  });
});

describe("Patrón estrategia · intercambiabilidad", () => {
  it("un agente alternativo funciona sin tocar el motor", () => {
    class HolderAgent implements Agent {
      name = "holder";
      buildArmy(): ArmyBlueprint {
        return [{ type: "LIGHT" as UnitType, rank: 1 }];
      }
      planTurn(): OrderSet {
        return { global: { kind: OrderType.Hold } };
      }
    }
    const engine = new GameEngine([new HolderAgent(), new HolderAgent()], { seed: 3 });
    engine.setup();
    let guard = 0;
    while (!engine.state.finished && guard++ < 100) engine.tick();
    expect(engine.state.finished).toBe(true);
  });
});

function makeView(engine: GameEngine, selfArmyId: number): BattlefieldView {
  const units = engine.state.units
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
  return {
    turn: engine.state.turn,
    maxTurns: 30,
    fieldSize: 720,
    selfArmyId,
    units,
    rng: createRng(2),
    alliances: [],
    reputations: {},
    own() {
      return this.units.filter((u) => u.armyId === selfArmyId);
    },
    enemies() {
      return this.units.filter((u) => u.armyId !== selfArmyId);
    },
    armyStrength(armyId: number) {
      return this.units
        .filter((u) => u.armyId === armyId)
        .reduce((s, u) => s + u.cost * (u.hp / u.maxHp), 0);
    },
    unitCount(armyId: number) {
      return this.units.filter((u) => u.armyId === armyId).length;
    },
    nearestEnemyTo() {
      return this.enemies()[0] ?? null;
    },
    nearestAllyTo() {
      return this.own()[0] ?? null;
    },
  };
}
