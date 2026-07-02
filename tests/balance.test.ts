import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/config/game.ts";
import { UNIT_DEFS } from "../src/config/units.ts";
import { Unit } from "../src/domain/Unit.ts";
import { UnitType } from "../src/domain/types.ts";
import { computeDamage } from "../src/engine/combat.ts";

/** Turnos para alcanzar (entrar en el propio rango de) una unidad estática
 * situada a la distancia de referencia (el lado del campo). */
function turnsToReach(type: UnitType): number {
  const { range, move } = UNIT_DEFS[type].baseStats;
  return Math.ceil((GAME_CONFIG.fieldSize - range) / move);
}

describe("Balance · alcance de movimiento", () => {
  it("la unidad más rápida (caballería) alcanza en 2 turnos", () => {
    expect(turnsToReach(UnitType.Cavalry)).toBe(2);
  });

  it("la unidad más lenta (inf. pesada) alcanza en 10 turnos", () => {
    expect(turnsToReach(UnitType.Heavy)).toBe(10);
  });

  it("el resto de tipos quedan entre esos dos extremos", () => {
    const turns = {
      cavalry: turnsToReach(UnitType.Cavalry),
      light: turnsToReach(UnitType.Light),
      archer: turnsToReach(UnitType.Archer),
      heavy: turnsToReach(UnitType.Heavy),
    };
    expect(turns.cavalry).toBeLessThan(turns.light);
    expect(turns.light).toBeLessThan(turns.archer);
    expect(turns.archer).toBeLessThan(turns.heavy);
  });
});

describe("Balance · duración de combate", () => {
  it("dos caballerías rango 1 en contacto tardan exactamente 5 turnos en matarse", () => {
    const a = new Unit({ id: "a", type: UnitType.Cavalry, armyId: 0, rank: 1, pos: { x: 0, y: 0 } });
    const b = new Unit({ id: "b", type: UnitType.Cavalry, armyId: 1, rank: 1, pos: { x: 1, y: 0 } });

    let turns = 0;
    while (a.hp > 0 && b.hp > 0 && turns < 50) {
      // Régimen estable: ya en contacto, sin bonus de carga (distancia 0).
      const dmgToB = computeDamage(a, b);
      const dmgToA = computeDamage(b, a);
      b.hp -= dmgToB;
      a.hp -= dmgToA;
      turns++;
    }

    expect(turns).toBe(5);
    expect(a.hp).toBeLessThanOrEqual(0);
    expect(b.hp).toBeLessThanOrEqual(0);
  });
});
