import archerSvg from "../assets/units/char-archer-r1.svg?raw";
import lightSvg from "../assets/units/char-light-r1.svg?raw";
import heavySvg from "../assets/units/char-heavy-r1.svg?raw";
import cavalrySvg from "../assets/units/char-cavalry-r1.svg?raw";
import { UnitType, type ArmyId, type Rank } from "../domain/types.ts";

const RAW_SVG_BY_TYPE: Record<UnitType, string> = {
  [UnitType.Archer]: archerSvg,
  [UnitType.Light]: lightSvg,
  [UnitType.Heavy]: heavySvg,
  [UnitType.Cavalry]: cavalrySvg,
};

const ACCENT_RE = /(id="army-accent"[\s\S]*?fill=")#4da3ff(")/;
const BADGE_RE = /<g id="rank-badge">[\s\S]*?<\/g>/;

/**
 * Sólo existe arte para rango 1 por ahora (ver fase "Sprites ilustrados" del
 * plan): todos los rangos reutilizan el mismo dibujo hasta que se entreguen
 * las variantes de rango 2-5. La insignia de rango incrustada en el SVG se
 * elimina siempre (ver `getSprite`): el número real lo sigue dibujando
 * `CanvasRenderer` encima, así el arte no queda "mintiendo" para rangos altos.
 */
function rawSvgFor(type: UnitType, _rank: Rank): string {
  return RAW_SVG_BY_TYPE[type];
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
