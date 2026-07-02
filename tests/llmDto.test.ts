import { describe, expect, it } from "vitest";
import { GameEngine } from "../src/engine/GameEngine.ts";
import { toArmyBuildRequest, toBattlefieldSnapshot } from "../src/agents/llm/dto.ts";
import type { Agent, ArmyBlueprint, ArmyBuildContext, BattlefieldView } from "../src/agents/Agent.ts";
import { UnitType } from "../src/domain/types.ts";
import { OrderType, type OrderSet } from "../src/orders/orders.ts";

class CapturingAgent implements Agent {
  name = "capture";
  capturedCtx: ArmyBuildContext | null = null;
  capturedView: BattlefieldView | null = null;
  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    this.capturedCtx = ctx;
    return [{ type: UnitType.Light, rank: 1 }];
  }
  planTurn(view: BattlefieldView): OrderSet {
    this.capturedView = view;
    return { global: { kind: OrderType.Hold } };
  }
}

describe("toArmyBuildRequest", () => {
  it("produce un snapshot JSON-serializable con el catálogo completo de 20 combinaciones", () => {
    const a = new CapturingAgent();
    const b = new CapturingAgent();
    const engine = new GameEngine([a, b], { seed: 1 });
    engine.setup();

    expect(a.capturedCtx).not.toBeNull();
    const dto = toArmyBuildRequest(a.capturedCtx!);
    expect(() => JSON.stringify(dto)).not.toThrow();
    expect(dto.unitCatalog).toHaveLength(20); // 4 tipos x 5 rangos
    expect(dto.budget).toBeGreaterThan(0);
    expect(dto.selfArmyId).toBe(0);

    // Cada entrada del catálogo trae coste y stats ya resueltos.
    const rank1Cavalry = dto.unitCatalog.find((e) => e.type === UnitType.Cavalry && e.rank === 1);
    expect(rank1Cavalry?.cost).toBeGreaterThan(0);
    expect(rank1Cavalry?.stats.range).toBeGreaterThan(0);
  });
});

describe("toBattlefieldSnapshot", () => {
  it("produce un snapshot JSON-serializable sin el campo rng (no serializable)", () => {
    const a = new CapturingAgent();
    const b = new CapturingAgent();
    const engine = new GameEngine([a, b], { seed: 2 });
    engine.setup();
    engine.tick();

    expect(a.capturedView).not.toBeNull();
    const dto = toBattlefieldSnapshot(a.capturedView!);
    expect(() => JSON.stringify(dto)).not.toThrow();
    expect(dto).not.toHaveProperty("rng");
    expect(dto.units.length).toBeGreaterThan(0);
    expect(dto.armyStrengths[0]).toBeGreaterThanOrEqual(0);
    expect(dto.unitCounts[0]).toBeGreaterThanOrEqual(0);

    // Las unidades propias se distinguen por armyId === selfArmyId, sin listas separadas redundantes.
    const own = dto.units.filter((u) => u.armyId === dto.selfArmyId);
    expect(own.length).toBeGreaterThan(0);
  });
});
