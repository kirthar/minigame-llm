import { describe, expect, it } from "vitest";
import { UtilityAgent } from "../src/agents/UtilityAgent.ts";
import { computeBetrayalPayoff, isTargetExcluded } from "../src/agents/utilityTactics.ts";
import { UNIT_DEFS } from "../src/config/units.ts";
import { costMultiplier, statMultiplier } from "../src/config/ranks.ts";
import { createRng } from "../src/engine/rng.ts";
import { OrderType, resolveOrder } from "../src/orders/orders.ts";
import { UnitType, type Rank } from "../src/domain/types.ts";
import type { ArmyBuildContext, BattlefieldView, UnitView } from "../src/agents/Agent.ts";

const BUDGET = 1600;

function ctx(seed: number): ArmyBuildContext {
  return {
    budget: BUDGET,
    selfArmyId: 0,
    armyCount: 2,
    fieldSize: 1200,
    rng: createRng(seed),
    costOf: (t, r) => Math.ceil(UNIT_DEFS[t].baseCost * costMultiplier(r)),
    statsOf: (t, r) => {
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

describe("UtilityAgent.buildArmy", () => {
  it("es determinista con la misma semilla", () => {
    const agent = new UtilityAgent();
    const b1 = agent.buildArmy(ctx(42));
    const b2 = agent.buildArmy(ctx(42));
    expect(b1).toEqual(b2);
  });

  it("respeta el presupuesto", () => {
    const agent = new UtilityAgent();
    const blueprint = agent.buildArmy(ctx(7));
    const spent = blueprint.reduce(
      (s, e) => s + Math.ceil(UNIT_DEFS[e.type].baseCost * costMultiplier(e.rank)),
      0,
    );
    expect(spent).toBeLessThanOrEqual(BUDGET);
    expect(blueprint.length).toBeGreaterThan(20);
  });

  it("la composición varía entre semillas distintas", () => {
    const agent = new UtilityAgent();
    const b1 = agent.buildArmy(ctx(1));
    const b2 = agent.buildArmy(ctx(2));
    expect(b1).not.toEqual(b2);
  });
});

function unit(id: string, armyId: number, overrides: Partial<UnitView> = {}): UnitView {
  return {
    id,
    type: UnitType.Light,
    armyId,
    rank: 1 as Rank,
    pos: { x: 100, y: 100 },
    hp: 21,
    maxHp: 21,
    stats: { maxHp: 21, attack: 3, range: 3, move: 300, armor: 0 },
    cost: 6,
    hpFrac: 1,
    ...overrides,
  };
}

function makeView(params: {
  selfArmyId: number;
  units: UnitView[];
  alliances?: ReadonlyArray<readonly [number, number]>;
  reputations?: Record<number, number>;
  seed?: number;
}): BattlefieldView {
  const { selfArmyId, units, alliances = [], reputations = {}, seed = 1 } = params;
  const strengthByArmy = new Map<number, number>();
  for (const u of units) {
    strengthByArmy.set(u.armyId, (strengthByArmy.get(u.armyId) ?? 0) + u.cost * u.hpFrac);
  }
  return {
    turn: 5,
    maxTurns: 30,
    fieldSize: 1200,
    selfArmyId,
    units,
    rng: createRng(seed),
    alliances,
    reputations,
    own() {
      return this.units.filter((u) => u.armyId === selfArmyId);
    },
    enemies() {
      return this.units.filter((u) => u.armyId !== selfArmyId);
    },
    armyStrength(armyId: number) {
      return strengthByArmy.get(armyId) ?? 0;
    },
    unitCount(armyId: number) {
      return this.units.filter((u) => u.armyId === armyId).length;
    },
    nearestEnemyTo() {
      return this.enemies()[0] ?? null;
    },
    nearestAllyTo(_pos, excludeId) {
      return this.own().find((u) => u.id !== excludeId) ?? null;
    },
  };
}

describe("UtilityAgent · exclusión de objetivos aliados", () => {
  it("no ataca a un ejército aliado si el beneficio no supera el umbral", () => {
    const agent = new UtilityAgent();
    const own = unit("self", 0, { pos: { x: 100, y: 100 } });
    const enemy = unit("ally-unit", 1, { pos: { x: 101, y: 100 }, hpFrac: 1, cost: 6 });
    const view = makeView({
      selfArmyId: 0,
      units: [own, enemy],
      alliances: [[0, 1]],
    });
    agent.onBattleStart(view);
    const orders = agent.planTurn(view);
    const order = resolveOrder(orders, own.id, own.type);
    expect(order.kind).not.toBe(OrderType.Attack);
    expect(order.kind).not.toBe(OrderType.Capture);
  });

  it("no excluye a un ejército no aliado ni perdonado (comportamiento normal)", () => {
    const enemy = unit("enemy", 1, { hpFrac: 1, cost: 6 });
    const profile = {
      aggression: 0.5,
      caution: 0.5,
      opportunism: 0.5,
      cohesion: 0.5,
      mobility: 0.5,
      diplomacy: 0.5,
    };
    expect(isTargetExcluded(enemy, false, profile, 0)).toBe(false);
  });
});

describe("isTargetExcluded / computeBetrayalPayoff", () => {
  const profile = {
    aggression: 0.5,
    caution: 0.5,
    opportunism: 0.4,
    cohesion: 0.5,
    mobility: 0.5,
    diplomacy: 0.1,
  };

  it("excluye a un aliado sano y barato (el beneficio no compensa)", () => {
    const cheapHealthyAlly = unit("cheap", 1, { hpFrac: 1, cost: 6 });
    expect(isTargetExcluded(cheapHealthyAlly, true, profile, 0)).toBe(true);
  });

  it("deja de excluir a un aliado caro y muy debilitado (traición rentable)", () => {
    const juicyTarget = unit("juicy", 1, { hpFrac: 0.05, cost: 200 });
    const payoff = computeBetrayalPayoff(juicyTarget, profile, 0);
    expect(payoff).toBeGreaterThan(25);
    expect(isTargetExcluded(juicyTarget, true, profile, 0)).toBe(false);
  });

  it("una reputación propia alta (ya traidor conocido) desincentiva traicionar de nuevo", () => {
    const juicyTarget = unit("juicy", 1, { hpFrac: 0.05, cost: 200 });
    expect(isTargetExcluded(juicyTarget, true, profile, 0)).toBe(false);
    expect(isTargetExcluded(juicyTarget, true, profile, 5)).toBe(true);
  });
});
