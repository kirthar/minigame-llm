import { describe, expect, it } from "vitest";
import { captureProbability } from "../src/engine/combat.ts";
import { createRng } from "../src/engine/rng.ts";

describe("captureProbability", () => {
  it("ventaja de +2 rangos = éxito seguro", () => {
    expect(captureProbability(3, 1)).toBe(1);
    expect(captureProbability(5, 3)).toBe(1);
  });
  it("desventaja de −2 rangos = imposible", () => {
    expect(captureProbability(1, 3)).toBe(0);
  });
  it("mismo rango = 50%", () => {
    expect(captureProbability(2, 2)).toBe(0.5);
  });
  it("un rango de ventaja = 75%", () => {
    expect(captureProbability(2, 1)).toBe(0.75);
  });
});

describe("RNG determinista", () => {
  it("la misma semilla produce la misma secuencia", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it("chance(1) siempre true y chance(0) siempre false", () => {
    const rng = createRng(7);
    for (let i = 0; i < 20; i++) {
      expect(rng.chance(1)).toBe(true);
      expect(rng.chance(0)).toBe(false);
    }
  });
});
