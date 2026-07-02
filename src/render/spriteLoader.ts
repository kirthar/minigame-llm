import archerR1 from "../assets/units/char-archer-r1.svg?raw";
import archerR2 from "../assets/units/char-archer-r2.svg?raw";
import archerR3 from "../assets/units/char-archer-r3.svg?raw";
import archerR4 from "../assets/units/char-archer-r4.svg?raw";
import archerR5 from "../assets/units/char-archer-r5.svg?raw";
import lightR1 from "../assets/units/char-light-r1.svg?raw";
import lightR2 from "../assets/units/char-light-r2.svg?raw";
import lightR3 from "../assets/units/char-light-r3.svg?raw";
import lightR4 from "../assets/units/char-light-r4.svg?raw";
import lightR5 from "../assets/units/char-light-r5.svg?raw";
import heavyR1 from "../assets/units/char-heavy-r1.svg?raw";
import heavyR2 from "../assets/units/char-heavy-r2.svg?raw";
import heavyR3 from "../assets/units/char-heavy-r3.svg?raw";
import heavyR4 from "../assets/units/char-heavy-r4.svg?raw";
import heavyR5 from "../assets/units/char-heavy-r5.svg?raw";
import cavalryR1 from "../assets/units/char-cavalry-r1.svg?raw";
import cavalryR2 from "../assets/units/char-cavalry-r2.svg?raw";
import cavalryR3 from "../assets/units/char-cavalry-r3.svg?raw";
import cavalryR4 from "../assets/units/char-cavalry-r4.svg?raw";
import cavalryR5 from "../assets/units/char-cavalry-r5.svg?raw";
import { MIN_RANK, UnitType, type ArmyId, type Rank } from "../domain/types.ts";

const RAW_SVG_BY_TYPE: Record<UnitType, Partial<Record<Rank, string>>> = {
  [UnitType.Archer]: { 1: archerR1, 2: archerR2, 3: archerR3, 4: archerR4, 5: archerR5 },
  [UnitType.Light]: { 1: lightR1, 2: lightR2, 3: lightR3, 4: lightR4, 5: lightR5 },
  [UnitType.Heavy]: { 1: heavyR1, 2: heavyR2, 3: heavyR3, 4: heavyR4, 5: heavyR5 },
  [UnitType.Cavalry]: { 1: cavalryR1, 2: cavalryR2, 3: cavalryR3, 4: cavalryR4, 5: cavalryR5 },
};

const ACCENT_RE = /(id="army-accent"[\s\S]*?fill=")#4da3ff(")/;
const BADGE_RE = /<g id="rank-badge">[\s\S]*?<\/g>/;

/**
 * Busca el arte del rango pedido y, si faltara, desciende al rango disponible
 * más alto por debajo (rango 1 siempre existe, es el suelo garantizado). Esto
 * mantiene una degradación elegante si en el futuro se añade un tipo de
 * unidad o un rango sin arte propia todavía.
 */
function rawSvgFor(type: UnitType, rank: Rank): string {
  const byRank = RAW_SVG_BY_TYPE[type];
  for (let r = rank; r >= MIN_RANK; r--) {
    const svg = byRank[r as Rank];
    if (svg) return svg;
  }
  return byRank[MIN_RANK]!;
}

const cache = new Map<string, HTMLImageElement>();

function cacheKey(type: UnitType, rank: Rank, armyId: ArmyId): string {
  return `${type}:${rank}:${armyId}`;
}

/**
 * Devuelve (y cachea) el `HTMLImageElement` para (tipo, rango, ejército), con
 * el elemento `id="army-accent"` recoloreado a `armyColor` y sin la insignia
 * de rango incrustada. La carga es asíncrona (SVG en memoria → Blob → Image);
 * mientras no ha terminado de decodificar, `image.complete` es `false` — el
 * llamador debe comprobarlo y usar su propio fallback ese frame.
 */
export function getSprite(type: UnitType, rank: Rank, armyId: ArmyId, armyColor: string): HTMLImageElement {
  const key = cacheKey(type, rank, armyId);
  const existing = cache.get(key);
  if (existing) return existing;

  const svg = rawSvgFor(type, rank).replace(ACCENT_RE, `$1${armyColor}$2`).replace(BADGE_RE, "");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const image = new Image();
  image.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
  image.src = url;

  cache.set(key, image);
  return image;
}

/** Limpia la caché de sprites (usado al reiniciar una partida). */
export function clearSpriteCache(): void {
  cache.clear();
}
