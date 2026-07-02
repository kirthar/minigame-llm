import { describe, expect, it } from "vitest";
import { driftProfile, initProfile } from "../src/agents/utilityProfile.ts";
import { createRng } from "../src/engine/rng.ts";
import { UnitType } from "../src/domain/types.ts";
import type { UnitView } from "../src/agents/Agent.ts";

function unit(type: UnitType, rank: 1 | 2 | 3 | 4 | 5 = 1): UnitView {
  return {
    id: `${type}-${Math.random()}`,
    type,
    armyId: 0,
    rank,
    pos: { x: 0, y: 0 },
    hp: 10,
    maxHp: 10,
    stats: { maxHp: 10, attack: 1, range: 1, move: 1, armor: 0 },
    cost: 10,
    hpFrac: 1,
  };
}

describe("initProfile", () => {
  it("es determinista con la misma semilla", () => {
    const own = [unit(UnitType.Cavalry), unit(UnitType.Cavalry), unit(UnitType.Heavy)];
    const p1 = initProfile(own, 1, createRng(123));
    const p2 = initProfile(own, 1, createRng(123));
    expect(p1).toEqual(p2);
  });

  it("todos los pesos quedan en [0,1]", () => {
    const own = [unit(UnitType.Cavalry), unit(UnitType.Heavy), unit(UnitType.Archer), unit(UnitType.Light)];
    const p = initProfile(own, 0.3, createRng(9));
    for (const v of Object.values(p)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("un ejército con mucha caballería tiene más movilidad y agresión que uno de infantería pesada", () => {
    const cavalryHeavy = Array.from({ length: 10 }, () => unit(UnitType.Cavalry));
    const heavyHeavy = Array.from({ length: 10 }, () => unit(UnitType.Heavy));
    const pCav = initProfile(cavalryHeavy, 1, createRng(1));
    const pHeavy = initProfile(heavyHeavy, 1, createRng(1));
    expect(pCav.mobility).toBeGreaterThan(pHeavy.mobility);
    expect(pCav.aggression).toBeGreaterThan(pHeavy.aggression);
    expect(pHeavy.caution).toBeGreaterThan(pCav.caution);
  });
});

describe("driftProfile", () => {
  it("aumenta la cautela y baja la agresión cuando la fuerza relativa es baja", () => {
    const base = {
      aggression: 0.5,
      caution: 0.5,
      opportunism: 0.5,
      cohesion: 0.5,
      mobility: 0.5,
      diplomacy: 0.5,
    };
    const drifted = driftProfile(base, 0.1, 0.8);
    expect(drifted.caution).toBeGreaterThan(base.caution);
    expect(drifted.aggression).toBeLessThan(base.aggression);
  });

  it("aumenta la agresión cuando la fuerza relativa es alta", () => {
    const base = {
      aggression: 0.5,
      caution: 0.5,
      opportunism: 0.5,
      cohesion: 0.5,
      mobility: 0.5,
      diplomacy: 0.5,
    };
    const drifted = driftProfile(base, 3, 0.8);
    expect(drifted.aggression).toBeGreaterThan(base.aggression);
  });

  it("nunca se sale de [0,1] aunque se aplique repetidamente", () => {
    let profile = {
      aggression: 0.9,
      caution: 0.1,
      opportunism: 0.9,
      cohesion: 0.5,
      mobility: 0.5,
      diplomacy: 0.9,
    };
    for (let i = 0; i < 50; i++) {
      profile = driftProfile(profile, 5, 0.1);
    }
    for (const v of Object.values(profile)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
