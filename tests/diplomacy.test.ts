import { describe, expect, it } from "vitest";
import { pairKey, resolveDiplomacy, type DiplomacyIntent } from "../src/domain/diplomacy.ts";
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

  it("break retira un pacto existente", () => {
    const state = new GameState();
    state.alliances.add(pairKey(0, 1));
    const intents = new Map<number, DiplomacyIntent[]>([[0, [{ kind: "break", withArmyId: 1 }]]]);
    const events = resolveDiplomacy(intents, state);
    expect(state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events.some((e) => e.kind === "alliance-broken")).toBe(true);
  });
});

describe("GameEngine · traición", () => {
  it("atacar a un aliado rompe el pacto y emite un evento de traición", () => {
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
        if (this.turn <= 1) return { global: { kind: OrderType.Hold } };
        return { global: { kind: OrderType.Attack } };
      }
    }

    const a = new AllyThenAttackAgent();
    const b = new AllyThenAttackAgent();
    const engine = new GameEngine([a, b], { seed: 11 });
    engine.setup();

    // Fuera de rango en el turno 1 (Hold ataca a lo que YA esté en rango, así
    // que hay que evitar el contacto hasta que la alianza se haya formado).
    // A distancia de movimiento de una unidad de infantería ligera para que
    // el turno 2 (Attack) cierre la distancia y ataque en el mismo turno.
    engine.state.units.length = 0;
    const u0 = new Unit({ id: "u0", type: UnitType.Light, armyId: 0, rank: 1, pos: { x: 100, y: 100 } });
    const u1 = new Unit({ id: "u1", type: UnitType.Light, armyId: 1, rank: 1, pos: { x: 350, y: 100 } });
    engine.state.units.push(u0, u1);

    // Turno 1: ambos proponen alianza mutua (mismo turno) -> se forma; están
    // fuera de rango así que Hold no dispara ningún ataque todavía.
    const r1 = engine.tick();
    expect(engine.state.alliances.has(pairKey(0, 1))).toBe(true);
    expect(r1.events.some((e) => e.kind === "attack")).toBe(false);

    // Turno 2: ambos se acercan y atacan a pesar de la alianza -> traición mutua.
    const { events } = engine.tick();
    expect(engine.state.alliances.has(pairKey(0, 1))).toBe(false);
    expect(events.some((e) => e.kind === "betrayal")).toBe(true);
    expect(engine.state.betrayalCounts[0]).toBeGreaterThan(0);
  });
});
