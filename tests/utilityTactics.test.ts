import { describe, expect, it } from "vitest";
import {
  clusterUnits,
  findShield,
  flankDestination,
  hideBehindAllyDestination,
  retreatDestination,
} from "../src/agents/utilityTactics.ts";
import { createRng } from "../src/engine/rng.ts";
import { distance } from "../src/engine/geometry.ts";
import { UnitType } from "../src/domain/types.ts";
import type { UnitView } from "../src/agents/Agent.ts";

function unit(id: string, x: number, y: number, overrides: Partial<UnitView> = {}): UnitView {
  return {
    id,
    type: UnitType.Light,
    armyId: 0,
    rank: 1,
    pos: { x, y },
    hp: 10,
    maxHp: 10,
    stats: { maxHp: 10, attack: 3, range: 3, move: 20, armor: 0 },
    cost: 6,
    hpFrac: 1,
    ...overrides,
  };
}

describe("clusterUnits", () => {
  it("separa dos grupos claramente distantes en clusters distintos", () => {
    const groupA = Array.from({ length: 6 }, (_, i) => unit(`a${i}`, 10 + i, 10));
    const groupB = Array.from({ length: 6 }, (_, i) => unit(`b${i}`, 900 + i, 900));
    const groups = clusterUnits([...groupA, ...groupB], createRng(1));

    expect(groups.length).toBeGreaterThanOrEqual(2);
    // Cada unidad de groupA debe terminar en el mismo cluster que sus compañeras.
    const clusterOfA0 = groups.find((g) => g.units.some((u) => u.id === "a0"));
    for (const u of groupA) {
      expect(clusterOfA0?.units.some((x) => x.id === u.id)).toBe(true);
    }
  });

  it("no pierde unidades: la suma de todos los grupos es el total", () => {
    const units = Array.from({ length: 23 }, (_, i) => unit(`u${i}`, i * 10, i * 3));
    const groups = clusterUnits(units, createRng(5));
    const total = groups.reduce((s, g) => s + g.units.length, 0);
    expect(total).toBe(units.length);
  });
});

describe("retreatDestination", () => {
  it("se aleja estrictamente de la amenaza", () => {
    const self = unit("self", 100, 100);
    const threat = unit("threat", 110, 100);
    const dest = retreatDestination(self, threat, 1200);
    expect(distance(dest, threat.pos)).toBeGreaterThan(distance(self.pos, threat.pos));
  });

  it("no supera el presupuesto de movimiento (con margen del multiplicador de huida)", () => {
    const self = unit("self", 100, 100, { stats: { maxHp: 10, attack: 3, range: 3, move: 50, armor: 0 } });
    const threat = unit("threat", 110, 100);
    const dest = retreatDestination(self, threat, 1200);
    expect(distance(self.pos, dest)).toBeLessThanOrEqual(50 * 1.5 + 1e-6);
  });
});

describe("flankDestination", () => {
  it("produce un desplazamiento lateral no nulo respecto a la línea directa al enemigo", () => {
    const groupCentroid = { x: 100, y: 100 };
    const enemyCentroid = { x: 300, y: 100 };
    const dest = flankDestination(groupCentroid, enemyCentroid, 1200, 1);
    // La línea directa es horizontal (misma y); un flanqueo debe desviar en y.
    expect(Math.abs(dest.y - groupCentroid.y)).toBeGreaterThan(1);
  });

  it("los lados opuestos producen destinos en direcciones opuestas", () => {
    const groupCentroid = { x: 100, y: 100 };
    const enemyCentroid = { x: 300, y: 100 };
    const left = flankDestination(groupCentroid, enemyCentroid, 1200, 1);
    const right = flankDestination(groupCentroid, enemyCentroid, 1200, -1);
    expect(Math.sign(left.y - groupCentroid.y)).not.toBe(Math.sign(right.y - groupCentroid.y));
  });
});

describe("findShield / hideBehindAllyDestination", () => {
  it("encuentra un aliado interpuesto entre la unidad y la amenaza", () => {
    const self = unit("self", 100, 100);
    const threat = unit("threat", 300, 100);
    const goodShield = unit("shield", 200, 100, { hpFrac: 0.9 });
    const badShield = unit("far", 100, 400, { hpFrac: 0.9 });
    const shield = findShield(self, threat, [goodShield, badShield]);
    expect(shield?.id).toBe("shield");
  });

  it("ignora aliados demasiado debilitados como escudo", () => {
    const self = unit("self", 100, 100);
    const threat = unit("threat", 300, 100);
    const weakShield = unit("weak", 200, 100, { hpFrac: 0.1 });
    const shield = findShield(self, threat, [weakShield]);
    expect(shield).toBeNull();
  });

  it("el destino de esconderse queda entre la unidad y su escudo", () => {
    const self = unit("self", 100, 100);
    const shield = unit("shield", 200, 100);
    const dest = hideBehindAllyDestination(self, shield);
    expect(dest.x).toBeGreaterThan(self.pos.x);
    expect(dest.x).toBeLessThan(shield.pos.x);
  });
});
