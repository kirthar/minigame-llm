import { describe, expect, it } from "vitest";
import archerR1 from "../src/assets/units/char-archer-r1.svg?raw";
import archerR2 from "../src/assets/units/char-archer-r2.svg?raw";
import archerR3 from "../src/assets/units/char-archer-r3.svg?raw";
import archerR4 from "../src/assets/units/char-archer-r4.svg?raw";
import archerR5 from "../src/assets/units/char-archer-r5.svg?raw";
import lightR1 from "../src/assets/units/char-light-r1.svg?raw";
import lightR2 from "../src/assets/units/char-light-r2.svg?raw";
import lightR3 from "../src/assets/units/char-light-r3.svg?raw";
import lightR4 from "../src/assets/units/char-light-r4.svg?raw";
import lightR5 from "../src/assets/units/char-light-r5.svg?raw";
import heavyR1 from "../src/assets/units/char-heavy-r1.svg?raw";
import heavyR2 from "../src/assets/units/char-heavy-r2.svg?raw";
import heavyR3 from "../src/assets/units/char-heavy-r3.svg?raw";
import heavyR4 from "../src/assets/units/char-heavy-r4.svg?raw";
import heavyR5 from "../src/assets/units/char-heavy-r5.svg?raw";
import cavalryR1 from "../src/assets/units/char-cavalry-r1.svg?raw";
import cavalryR2 from "../src/assets/units/char-cavalry-r2.svg?raw";
import cavalryR3 from "../src/assets/units/char-cavalry-r3.svg?raw";
import cavalryR4 from "../src/assets/units/char-cavalry-r4.svg?raw";
import cavalryR5 from "../src/assets/units/char-cavalry-r5.svg?raw";

// Mismas expresiones regulares que usa spriteLoader.ts en tiempo de ejecución
// para recolorear el acento de ejército y eliminar la insignia de rango
// incrustada. Si un SVG no las cumple, el recoloreo/eliminación falla en
// silencio (sin excepción) y el arte queda mal en el juego sin que nada avise.
const ACCENT_RE = /(id="army-accent"[\s\S]*?fill=")#4da3ff(")/;
const BADGE_RE = /<g id="rank-badge">[\s\S]*?<\/g>/;

const ALL_SPRITES: Record<string, string> = {
  "archer-r1": archerR1,
  "archer-r2": archerR2,
  "archer-r3": archerR3,
  "archer-r4": archerR4,
  "archer-r5": archerR5,
  "light-r1": lightR1,
  "light-r2": lightR2,
  "light-r3": lightR3,
  "light-r4": lightR4,
  "light-r5": lightR5,
  "heavy-r1": heavyR1,
  "heavy-r2": heavyR2,
  "heavy-r3": heavyR3,
  "heavy-r4": heavyR4,
  "heavy-r5": heavyR5,
  "cavalry-r1": cavalryR1,
  "cavalry-r2": cavalryR2,
  "cavalry-r3": cavalryR3,
  "cavalry-r4": cavalryR4,
  "cavalry-r5": cavalryR5,
};

describe("assets de sprites de personaje (src/assets/units)", () => {
  it("existen las 20 combinaciones tipo×rango (4 tipos × 5 rangos)", () => {
    expect(Object.keys(ALL_SPRITES)).toHaveLength(20);
  });

  for (const [name, svg] of Object.entries(ALL_SPRITES)) {
    it(`char-${name}.svg cumple los contratos de army-accent/rank-badge`, () => {
      expect(svg).toContain('viewBox="0 0 200 200"');

      const accentMatches = svg.match(new RegExp(ACCENT_RE.source, "g")) ?? [];
      expect(accentMatches).toHaveLength(1);
      expect(ACCENT_RE.test(svg)).toBe(true);

      const badgeMatches = svg.match(new RegExp(BADGE_RE.source, "g")) ?? [];
      expect(badgeMatches).toHaveLength(1);

      // Recoloreo real: tras sustituir, el resultado debe cambiar respecto al original.
      const recolored = svg.replace(ACCENT_RE, "$1#ff0000$2");
      expect(recolored).not.toBe(svg);

      // Eliminación real: tras el strip, no debe quedar ningún rastro de "rank-badge".
      const stripped = svg.replace(BADGE_RE, "");
      expect(stripped).not.toContain("rank-badge");
    });
  }
});
