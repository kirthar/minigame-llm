import { describe, expect, it } from "vitest";
import { distance, spawnCenters } from "../src/engine/geometry.ts";

describe("spawnCenters", () => {
  for (let n = 2; n <= 6; n++) {
    it(`coloca ${n} ejércitos equidistantes del centro`, () => {
      const size = 720;
      const centers = spawnCenters(n, size, 0.82);
      expect(centers).toHaveLength(n);

      const mid = { x: size / 2, y: size / 2 };
      const radii = centers.map((c) => distance(c, mid));
      // Todos a la misma distancia del centro.
      for (const r of radii) {
        expect(r).toBeCloseTo(radii[0], 5);
      }

      // Consecutivos separados por el mismo ángulo → misma distancia entre vecinos.
      if (n >= 3) {
        const gaps = centers.map((c, i) =>
          distance(c, centers[(i + 1) % n]),
        );
        for (const g of gaps) {
          expect(g).toBeCloseTo(gaps[0], 4);
        }
      }
    });
  }
});
