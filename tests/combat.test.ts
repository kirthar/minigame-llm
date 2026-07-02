import { describe, expect, it } from "vitest";
import { Unit } from "../src/domain/Unit.ts";
import { UnitType } from "../src/domain/types.ts";
import { computeDamage, typeBonus } from "../src/engine/combat.ts";

function make(type: UnitType, rank = 1 as const) {
  return new Unit({ id: `${type}`, type, armyId: 0, rank, pos: { x: 0, y: 0 } });
}

describe("typeBonus (piedra-papel-tijera)", () => {
  it("caballería golpea más fuerte a arqueros y ligera", () => {
    expect(typeBonus(UnitType.Cavalry, UnitType.Archer)).toBe(1.5);
    expect(typeBonus(UnitType.Cavalry, UnitType.Light)).toBe(1.5);
  });
  it("pesada tiene bonus anti-carga vs caballería", () => {
    expect(typeBonus(UnitType.Heavy, UnitType.Cavalry)).toBe(1.5);
  });
  it("arqueros castigan a la infantería pesada", () => {
    expect(typeBonus(UnitType.Archer, UnitType.Heavy)).toBe(1.5);
  });
  it("emparejamiento neutro devuelve 1", () => {
    expect(typeBonus(UnitType.Heavy, UnitType.Archer)).toBe(1);
  });
});

describe("computeDamage", () => {
  it("aplica bonus de tipo y resta la armadura del defensor", () => {
    const cav = make(UnitType.Cavalry); // atk 7
    const archer = make(UnitType.Archer); // armor 0
    // 7 * 1.5 (vs arquero) - 0 = 10.5 -> 11 (sin bonus de carga: distancia 0)
    expect(computeDamage(cav, archer)).toBe(11);
  });

  it("la armadura reduce el daño de forma plana", () => {
    const light = make(UnitType.Light); // atk 3
    const heavy = make(UnitType.Heavy); // armor 2, sin bonus de tipo
    // 3 * 1 - 2 = 1
    expect(computeDamage(light, heavy)).toBe(1);
  });

  it("el daño mínimo es 1", () => {
    const light = make(UnitType.Light);
    const heavy = make(UnitType.Heavy);
    heavy.rank = 5; // mucha armadura efectiva no cambia armor base pero...
    expect(computeDamage(light, heavy)).toBeGreaterThanOrEqual(1);
  });

  it("la caballería suma bonus de carga por distancia recorrida", () => {
    const cav = make(UnitType.Cavalry);
    const heavy = make(UnitType.Heavy); // neutro, armor 2
    const still = computeDamage(cav, heavy);
    // Distancia acorde a la nueva escala de movimiento (move de caballería = 360).
    cav.distanceMovedThisTurn = 200;
    const charging = computeDamage(cav, heavy);
    expect(charging).toBeGreaterThan(still);
  });
});
