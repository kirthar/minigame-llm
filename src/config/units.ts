import { Shape, UnitType, type RangeByRank, type UnitTypeDef } from "../domain/types.ts";

/**
 * Stats base (rango 1) y costes de cada tipo de tropa.
 * Diseño piedra-papel-tijera. Todos los valores son editables aquí sin tocar la
 * lógica del motor.
 */

/**
 * Alcance de contacto cuerpo a cuerpo: distancia mínima para que el ataque se
 * dispare justo cuando las hitboxes (círculos) de dos unidades se tocan.
 * `UNIT_RADIUS = 7px` (`src/render/CanvasRenderer.ts`) y el canvas mide
 * 900px para un `fieldSize` de 1200 (`index.html` / `GAME_CONFIG.fieldSize`)
 * → escala = 900/1200 = 0.75 px/unidad de mundo → radio en mundo = 7/0.75 ≈
 * 9.33 → distancia de contacto = 2×9.33 ≈ 18.67 → redondeado hacia arriba: 19.
 * No escala con el rango: el tamaño de la hitbox no cambia al ascender.
 * (Si cambian `UNIT_RADIUS`, el ancho del canvas o `fieldSize`, recalcular.)
 */
const MELEE_CONTACT_RANGE = 19;
const MELEE_RANGE_BY_RANK: RangeByRank = [
  MELEE_CONTACT_RANGE,
  MELEE_CONTACT_RANGE,
  MELEE_CONTACT_RANGE,
  MELEE_CONTACT_RANGE,
  MELEE_CONTACT_RANGE,
];

/**
 * Alcance de arqueros: ~20% del campo (`fieldSize=1200` → 240) a rango 1,
 * creciendo con el mismo multiplicador que hp/ataque (`STAT_MULTIPLIER` en
 * `ranks.ts` = [1.0, 1.35, 1.8, 2.4, 3.2]) para mantener la progresión de
 * rango consistente en todo el juego: 240, 324, 432, 576, 768.
 */
const ARCHER_RANGE_BY_RANK: RangeByRank = [240, 324, 432, 576, 768];

export const UNIT_DEFS: Record<UnitType, UnitTypeDef> = {
  [UnitType.Archer]: {
    type: UnitType.Archer,
    label: "Arquero",
    shape: Shape.Triangle,
    baseStats: { maxHp: 17, attack: 4, move: 197, armor: 0 },
    rangeByRank: ARCHER_RANGE_BY_RANK,
    baseCost: 12,
    // Kitea y castiga a la infantería pesada.
    damageBonusVs: { [UnitType.Heavy]: 1.5 },
    chargeBonusPerDistance: 0,
  },
  [UnitType.Light]: {
    type: UnitType.Light,
    label: "Inf. ligera",
    shape: Shape.Circle,
    baseStats: { maxHp: 21, attack: 3, move: 300, armor: 1 },
    rangeByRank: MELEE_RANGE_BY_RANK,
    baseCost: 6,
    // Barata y numerosa; cierra distancias con los arqueros.
    damageBonusVs: { [UnitType.Archer]: 1.25 },
    chargeBonusPerDistance: 0,
  },
  [UnitType.Heavy]: {
    type: UnitType.Heavy,
    label: "Inf. pesada",
    shape: Shape.Square,
    baseStats: { maxHp: 43, attack: 5, move: 120, armor: 4 },
    rangeByRank: MELEE_RANGE_BY_RANK,
    baseCost: 15,
    // Muro anti-carga contra caballería.
    damageBonusVs: { [UnitType.Cavalry]: 1.5 },
    chargeBonusPerDistance: 0,
  },
  [UnitType.Cavalry]: {
    type: UnitType.Cavalry,
    label: "Caballería",
    shape: Shape.Diamond,
    baseStats: { maxHp: 30, attack: 7, move: 600, armor: 1 },
    rangeByRank: MELEE_RANGE_BY_RANK,
    baseCost: 20,
    // Arrolla a tropas ligeras y a arqueros.
    damageBonusVs: { [UnitType.Archer]: 1.5, [UnitType.Light]: 1.5 },
    chargeBonusPerDistance: 0.003,
  },
};
