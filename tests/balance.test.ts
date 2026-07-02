import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/config/game.ts";
import { UNIT_DEFS } from "../src/config/units.ts";
import { Unit } from "../src/domain/Unit.ts";
import { UnitType } from "../src/domain/types.ts";
import { computeDamage } from "../src/engine/combat.ts";

/** Turnos para alcanzar (entrar en el propio rango de) una unidad estática
 * situada a la distancia de referencia (el lado del campo), a rango 1. */
function turnsToReach(type: UnitType): number {
  const def = UNIT_DEFS[type];
  return Math.ceil((GAME_CONFIG.fieldSize - def.rangeByRank[0]) / def.baseStats.move);
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

describe("Balance · alcance de contacto cuerpo a cuerpo", () => {
  // UNIT_RADIUS=7px (CanvasRenderer.ts), canvas 900px, fieldSize=1200 →
  // escala=0.75 px/unidad → radio en mundo≈9.33 → contacto≈18.67 → ceil 19.
  const MELEE_CONTACT_RANGE = 19;

  it("infantería ligera, pesada y caballería tienen el mismo alcance de contacto en todos los rangos", () => {
    for (const type of [UnitType.Light, UnitType.Heavy, UnitType.Cavalry]) {
      for (const range of UNIT_DEFS[type].rangeByRank) {
        expect(range).toBe(MELEE_CONTACT_RANGE);
      }
    }
  });
});

describe("Balance · alcance de arqueros", () => {
  it("el alcance a rango 1 es ~20% del campo y crece con cada rango", () => {
    const rangeByRank = UNIT_DEFS[UnitType.Archer].rangeByRank;
    expect(rangeByRank[0]).toBe(Math.round(GAME_CONFIG.fieldSize * 0.2));
    for (let i = 1; i < rangeByRank.length; i++) {
      expect(rangeByRank[i]).toBeGreaterThan(rangeByRank[i - 1]);
    }
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
