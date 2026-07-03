import { describe, expect, it } from "vitest";
import {
  ALLIANCE_PROTECTION_TURNS,
  isProtected,
  pairKey,
  resolveDiplomacy,
  type DiplomacyIntent,
} from "../src/domain/diplomacy.ts";
import { GameState } from "../src/domain/GameState.ts";
import { GameEngine } from "../src/engine/GameEngine.ts";
import type {
  Agent,
  ArmyBlueprint,
  BattlefieldView,
  DiplomacyIntent as AgentDiplomacyIntent,
} from "../src/agents/Agent.ts";
import { OrderType, type OrderSet } from "../src/orders/orders.ts";
import { UnitType } from "../src/domain/types.ts";
import { Unit } from "../src/domain/Unit.ts";

describe("resolveDiplomacy", () => {
  it("propuesta mutua en el mismo turno forma una alianza", () => {
    const state = new GameState();
    const intents = new Map<number, DiplomacyIntent[]>([
      [0, [{ kind: "propose", withArmyId: 1 }]],
      [1, [{ kind: "propose", withArmyId: 0 }]],
    ]);
    const events = resolveDiplomacy(intents, state);
    expect(state.alliances.has(pairKey(0, 1))).toBe(true);
    expect(events.some((e) => e.kind === "alliance-formed")).toBe(true);
  });

  it("propuesta unilateral no forma alianza", () => {
    const state = new GameState();
    const intents = new Map<number, DiplomacyIntent[]>([[0, [{ kind: "propose", withArmyId: 1 }]]]);
    const events = resolveDiplomacy(intents, state);
    expect(state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("break retira un pacto existente una vez expirada su protección", () => {
    const state = new GameState();
    state.alliances.set(pairKey(0, 1), 0);
    state.turn = ALLIANCE_PROTECTION_TURNS; // fuera de la ventana de protección.
    const intents = new Map<number, DiplomacyIntent[]>([[0, [{ kind: "break", withArmyId: 1 }]]]);
    const events = resolveDiplomacy(intents, state);
    expect(state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events.some((e) => e.kind === "alliance-broken")).toBe(true);
  });

  it("break se ignora durante la ventana de protección y emite alliance-protected", () => {
    const state = new GameState();
    state.alliances.set(pairKey(0, 1), 3);
    state.turn = 6; // 6 - 3 = 3 < 5: todavía protegida.
    const intents = new Map<number, DiplomacyIntent[]>([[0, [{ kind: "break", withArmyId: 1 }]]]);
    const events = resolveDiplomacy(intents, state);
    expect(state.alliances.has(pairKey(0, 1))).toBe(true);
    expect(events.some((e) => e.kind === "alliance-broken")).toBe(false);
    const protectedEvent = events.find((e) => e.kind === "alliance-protected");
    expect(protectedEvent).toBeDefined();
    if (protectedEvent?.kind === "alliance-protected") {
      expect(protectedEvent.unprotectedAtTurn).toBe(8);
    }
  });

  it("break funciona con normalidad una vez expira la protección", () => {
    const state = new GameState();
    state.alliances.set(pairKey(0, 1), 3);
    state.turn = 8; // 8 - 3 = 5: ya no protegida.
    const intents = new Map<number, DiplomacyIntent[]>([[0, [{ kind: "break", withArmyId: 1 }]]]);
    const events = resolveDiplomacy(intents, state);
    expect(state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events.some((e) => e.kind === "alliance-broken")).toBe(true);
    expect(events.some((e) => e.kind === "alliance-protected")).toBe(false);
  });

  it("isProtected: protegida hasta formedTurn+4, expira en formedTurn+5", () => {
    const state = new GameState();
    const formedTurn = 10;
    state.alliances.set(pairKey(0, 1), formedTurn);

    state.turn = formedTurn + 4;
    expect(isProtected(state, 0, 1)).toBe(true);

    state.turn = formedTurn + 5;
    expect(isProtected(state, 0, 1)).toBe(false);
  });
});

describe("GameEngine · traición", () => {
  it("atacar a un aliado tras expirar la protección rompe el pacto y emite un evento de traición", () => {
    class AllyThenAttackAgent implements Agent {
      name = "ally-then-attack";
      private turn = 0;
      buildArmy(): ArmyBlueprint {
        return [{ type: UnitType.Light, rank: 1 }];
      }
      planDiplomacy(view: BattlefieldView): AgentDiplomacyIntent[] {
        const other = view.units.find((u) => u.armyId !== view.selfArmyId)?.armyId;
        if (this.turn === 0 && other !== undefined) {
          return [{ kind: "propose", withArmyId: other }];
        }
        return [];
      }
      planTurn(): OrderSet {
        this.turn++;
        if (this.turn <= ALLIANCE_PROTECTION_TURNS) return { global: { kind: OrderType.Hold } };
        return { global: { kind: OrderType.Attack } };
      }
    }

    const a = new AllyThenAttackAgent();
    const b = new AllyThenAttackAgent();
    const engine = new GameEngine([a, b], { seed: 11 });
    engine.setup();

    // Fuera de rango al principio (Hold ataca a lo que YA esté en rango, así
    // que hay que evitar el contacto hasta que la protección haya expirado).
    // A distancia de movimiento de una unidad de infantería ligera para que
    // el turno del primer Attack cierre la distancia y ataque ese mismo turno.
    engine.state.units.length = 0;
    const u0 = new Unit({ id: "u0", type: UnitType.Light, armyId: 0, rank: 1, pos: { x: 100, y: 100 } });
    const u1 = new Unit({ id: "u1", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 350, y: 100 } });
    engine.state.units.push(u0, u1);

    // Turno 1: ambos proponen alianza mutua (mismo turno) -> se forma; están
    // fuera de rango así que Hold no dispara ningún ataque todavía.
    const r1 = engine.tick();
    expect(engine.state.alliances.has(pairKey(0, 1))).toBe(true);
    expect(r1.events.some((e) => e.kind === "attack")).toBe(false);

    // Turnos 2..ALLIANCE_PROTECTION_TURNS: la alianza sigue protegida y las
    // unidades no se mueven (Hold), así que no hay contacto ni eventos.
    for (let i = 1; i < ALLIANCE_PROTECTION_TURNS; i++) {
      const r = engine.tick();
      expect(engine.state.alliances.has(pairKey(0, 1))).toBe(true);
      expect(r.events.some((e) => e.kind === "attack")).toBe(false);
    }

    // Turno ALLIANCE_PROTECTION_TURNS+1: expira la protección; ambos se
    // acercan y atacan a pesar de la alianza -> traición mutua.
    const { events } = engine.tick();
    expect(engine.state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events.some((e) => e.kind === "betrayal")).toBe(true);
    expect(engine.state.betrayalCounts[0]).toBeGreaterThan(0);
  });
});

/** Propone alianza mutua con el primer ejército distinto que vea y, a la vez, ordena Attack explícito contra `targetUnitId`. */
class InstantAllyAttackAgent implements Agent {
  name = "instant-ally-attack";
  constructor(private readonly targetUnitId: string) {}
  buildArmy(): ArmyBlueprint {
    return [{ type: UnitType.Light, rank: 1 }];
  }
  planDiplomacy(view: BattlefieldView): AgentDiplomacyIntent[] {
    const other = view.units.find((u) => u.armyId !== view.selfArmyId)?.armyId;
    return other !== undefined ? [{ kind: "propose", withArmyId: other }] : [];
  }
  planTurn(): OrderSet {
    return { global: { kind: OrderType.Attack, targetId: this.targetUnitId } };
  }
}

/** Opcionalmente propone alianza con `proposeTo` una vez; nunca ordena ataques (deja Hold por defecto). */
class PassiveAgent implements Agent {
  name = "passive";
  constructor(private readonly proposeTo?: number) {}
  buildArmy(): ArmyBlueprint {
    return [{ type: UnitType.Light, rank: 1 }];
  }
  planDiplomacy(): AgentDiplomacyIntent[] {
    return this.proposeTo !== undefined ? [{ kind: "propose", withArmyId: this.proposeTo }] : [];
  }
  planTurn(): OrderSet {
    return {};
  }
}

/** Se mantiene en su posición inicial y nunca ataca (una unidad con orden Move nunca entra en la fase de combate). */
class StationaryAgent implements Agent {
  name = "stationary";
  constructor(private readonly pos: { x: number; y: number }) {}
  buildArmy(): ArmyBlueprint {
    return [{ type: UnitType.Light, rank: 1 }];
  }
  planDiplomacy(): AgentDiplomacyIntent[] {
    return [];
  }
  planTurn(): OrderSet {
    return { global: { kind: OrderType.Move, to: this.pos } };
  }
}

describe("GameEngine · protección de alianza", () => {
  it("propuesta mutua con ataque explícito ya en rango se cancela ese mismo turno", () => {
    const a = new InstantAllyAttackAgent("u1");
    const b = new InstantAllyAttackAgent("u0");
    const engine = new GameEngine([a, b], { seed: 3 });
    engine.setup();

    engine.state.units.length = 0;
    const u0 = new Unit({ id: "u0", type: UnitType.Light, armyId: 0, rank: 1, pos: { x: 100, y: 100 } });
    const u1 = new Unit({ id: "u1", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 110, y: 100 } });
    engine.state.units.push(u0, u1);

    const { events } = engine.tick();
    expect(engine.state.alliances.has(pairKey(0, 1))).toBe(true);
    expect(events.some((e) => e.kind === "attack")).toBe(false);
    expect(events.some((e) => e.kind === "betrayal")).toBe(false);
    expect(u0.hp).toBe(u0.stats().maxHp);
    expect(u1.hp).toBe(u1.stats().maxHp);
  });

  it("durante la ventana de protección, la unidad ataca a OTRO enemigo válido en rango en vez de al aliado", () => {
    const agent0 = new InstantAllyAttackAgent("u1");
    const agent1 = new PassiveAgent(0);
    const agent2 = new StationaryAgent({ x: 85, y: 100 });
    const engine = new GameEngine([agent0, agent1, agent2], { armyCount: 3, seed: 5 });
    engine.setup();

    engine.state.units.length = 0;
    const u0 = new Unit({ id: "u0", type: UnitType.Light, armyId: 0, rank: 1, pos: { x: 100, y: 100 } });
    const u1 = new Unit({ id: "u1", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 110, y: 100 } });
    const u2 = new Unit({ id: "u2", type: UnitType.Light, armyId: 2, rank: 1, pos: { x: 85, y: 100 } });
    engine.state.units.push(u0, u1, u2);

    for (let i = 0; i < ALLIANCE_PROTECTION_TURNS; i++) {
      const { events } = engine.tick();
      expect(engine.state.alliances.has(pairKey(0, 1))).toBe(true);
      expect(events.some((e) => e.kind === "betrayal")).toBe(false);
      const attack = events.find((e) => e.kind === "attack" && e.attackerId === "u0");
      expect(attack).toBeDefined();
      if (attack?.kind === "attack") {
        expect(attack.targetId).toBe("u2");
      }
    }
  });

  it("tras expirar la protección, el ataque explícito al antiguo aliado aterriza y traiciona", () => {
    const agent0 = new InstantAllyAttackAgent("u1");
    const agent1 = new PassiveAgent(0);
    const agent2 = new StationaryAgent({ x: 85, y: 100 });
    const engine = new GameEngine([agent0, agent1, agent2], { armyCount: 3, seed: 7 });
    engine.setup();

    engine.state.units.length = 0;
    const u0 = new Unit({ id: "u0", type: UnitType.Light, armyId: 0, rank: 1, pos: { x: 100, y: 100 } });
    const u1 = new Unit({ id: "u1", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 110, y: 100 } });
    const u2 = new Unit({ id: "u2", type: UnitType.Light, armyId: 2, rank: 1, pos: { x: 85, y: 100 } });
    engine.state.units.push(u0, u1, u2);

    // Turnos 1..ALLIANCE_PROTECTION_TURNS: protegida, sin efecto sobre el resultado de este test.
    for (let i = 0; i < ALLIANCE_PROTECTION_TURNS; i++) {
      engine.tick();
    }

    // Turno ALLIANCE_PROTECTION_TURNS+1: expira la protección; el Attack explícito contra u1 aterriza.
    const { events } = engine.tick();
    expect(engine.state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events.some((e) => e.kind === "betrayal")).toBe(true);
    expect(events.some((e) => e.kind === "attack" && e.attackerId === "u0" && e.targetId === "u1")).toBe(
      true,
    );
  });
});
