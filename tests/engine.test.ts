import { describe, expect, it } from "vitest";
import { GameEngine } from "../src/engine/GameEngine.ts";
import { HeuristicAgent } from "../src/agents/HeuristicAgent.ts";
import type {
  Agent,
  ArmyBlueprint,
  BattlefieldView,
} from "../src/agents/Agent.ts";
import { Unit } from "../src/domain/Unit.ts";
import { UnitType } from "../src/domain/types.ts";
import { OrderType, type OrderSet } from "../src/orders/orders.ts";

/** Agente de prueba con órdenes fijas. */
class StubAgent implements Agent {
  constructor(
    readonly name: string,
    private readonly plan: (v: BattlefieldView) => OrderSet,
    private readonly army: ArmyBlueprint = [{ type: UnitType.Light, rank: 1 }],
  ) {}
  buildArmy(): ArmyBlueprint {
    return this.army;
  }
  planTurn(v: BattlefieldView): OrderSet {
    return this.plan(v);
  }
}

describe("GameEngine · fin de partida", () => {
  it("una batalla siempre termina dentro del límite de turnos", () => {
    const engine = new GameEngine(
      [new HeuristicAgent("balanced"), new HeuristicAgent("cavalry")],
      { seed: 123 },
    );
    engine.setup();
    let guard = 0;
    while (!engine.state.finished && guard++ < 200) engine.tick();
    expect(engine.state.finished).toBe(true);
    expect(engine.state.turn).toBeLessThanOrEqual(30);
  });

  it("es reproducible con la misma semilla", () => {
    const run = () => {
      const e = new GameEngine(
        [new HeuristicAgent("balanced"), new HeuristicAgent("ranged")],
        { seed: 777 },
      );
      e.setup();
      while (!e.state.finished) e.tick();
      return { winner: e.state.winner, turn: e.state.turn };
    };
    expect(run()).toEqual(run());
  });
});

describe("GameEngine · daño simultáneo", () => {
  it("dos unidades pueden morir en el mismo turno (muerte mutua)", () => {
    const attackAll = new StubAgent("A", () => ({
      global: { kind: OrderType.Attack },
    }));
    const engine = new GameEngine([attackAll, attackAll], { seed: 1 });
    engine.setup();

    // Escenario controlado: dos unidades adyacentes con muy poca vida.
    engine.state.units.length = 0;
    const u0 = new Unit({ id: "u0", type: UnitType.Light, armyId: 0, rank: 1, pos: { x: 100, y: 100 } });
    const u1 = new Unit({ id: "u1", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 101, y: 100 } });
    u0.hp = 2;
    u1.hp = 2;
    engine.state.units.push(u0, u1);

    const { events } = engine.tick();
    expect(u0.alive).toBe(false);
    expect(u1.alive).toBe(false);
    expect(events.filter((e) => e.kind === "kill")).toHaveLength(2);
  });
});

describe("GameEngine · captura", () => {
  it("una captura garantizada cambia de bando a la unidad", () => {
    const captor = new StubAgent("captor", (v) => {
      const enemy = v.enemies()[0];
      return { global: { kind: OrderType.Capture, targetId: enemy.id } };
    });
    const idle = new StubAgent("idle", () => ({ global: { kind: OrderType.Hold } }));
    const engine = new GameEngine([captor, idle], { seed: 5 });
    engine.setup();

    engine.state.units.length = 0;
    // Rango 3 vs rango 1 → probabilidad 100%.
    const strong = new Unit({ id: "s", type: UnitType.Heavy, armyId: 0, rank: 3, pos: { x: 200, y: 200 } });
    const weak = new Unit({ id: "w", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 201, y: 200 } });
    engine.state.units.push(strong, weak);

    engine.tick();
    expect(weak.alive).toBe(true);
    expect(weak.armyId).toBe(0); // capturada por el ejército 0

    // Regresión: la unidad capturada debe "pintarse" con el color de su nuevo
    // ejército (el render lee armyId en vivo desde una caché por ejército, no
    // por unidad, así que esto ya funciona; se deja garantizado con un test).
    const captorArmy = engine.state.armyById(0);
    const originalArmy = engine.state.armyById(1);
    expect(captorArmy).toBeDefined();
    expect(engine.state.armyById(weak.armyId)?.color).toBe(captorArmy?.color);
    expect(engine.state.armyById(weak.armyId)?.color).not.toBe(originalArmy?.color);
  });
});

describe("GameEngine · XP y rango", () => {
  it("matar otorga XP al asesino y puede subirlo de rango", () => {
    const attackAll = new StubAgent("A", () => ({ global: { kind: OrderType.Attack } }));
    const idle = new StubAgent("idle", () => ({ global: { kind: OrderType.Hold } }));
    const engine = new GameEngine([attackAll, idle], { seed: 2 });
    engine.setup();

    engine.state.units.length = 0;
    const killer = new Unit({ id: "k", type: UnitType.Cavalry, armyId: 0, rank: 1, pos: { x: 50, y: 50 } });
    const victim = new Unit({ id: "v", type: UnitType.Archer, armyId: 1, rank: 1, pos: { x: 51, y: 50 } });
    victim.hp = 1; // muere de un golpe
    engine.state.units.push(killer, victim);

    engine.tick();
    expect(victim.alive).toBe(false);
    expect(killer.xp).toBeGreaterThan(0);
  });
});
