/** Tipos y enumeraciones base del dominio, sin dependencias de DOM. */

/** Los 4 tipos de tropa disponibles. */
export enum UnitType {
  Archer = "ARCHER",
  Light = "LIGHT",
  Heavy = "HEAVY",
  Cavalry = "CAVALRY",
}

export const ALL_UNIT_TYPES: readonly UnitType[] = [
  UnitType.Archer,
  UnitType.Light,
  UnitType.Heavy,
  UnitType.Cavalry,
];

/** Forma geométrica con la que se dibuja cada tipo en el canvas. */
export enum Shape {
  Triangle = "triangle",
  Circle = "circle",
  Square = "square",
  Diamond = "diamond",
}

/** Fase de la partida. */
export enum Phase {
  Preparation = "PREPARATION",
  Battle = "BATTLE",
  Finished = "FINISHED",
}

/** Rango de una unidad: entero de 1 a 5. */
export type Rank = 1 | 2 | 3 | 4 | 5;
export const MIN_RANK: Rank = 1;
export const MAX_RANK: Rank = 5;

export type UnitId = string;
export type ArmyId = number;

/** Vector 2D en coordenadas continuas del campo de batalla. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Stats efectivas de una unidad ya escaladas por su rango. */
export interface Stats {
  maxHp: number;
  attack: number;
  range: number;
  move: number;
  armor: number;
}

/** Definición inmutable de un tipo de tropa (valores a rango 1). */
export interface UnitTypeDef {
  type: UnitType;
  label: string;
  shape: Shape;
  baseStats: Stats;
  /** Coste en puntos a rango 1. */
  baseCost: number;
  /** Multiplicadores de daño frente a otros tipos (1 = neutro). */
  damageBonusVs: Partial<Record<UnitType, number>>;
  /** Bonus de carga: daño extra por unidad de distancia recorrida este turno. */
  chargeBonusPerDistance: number;
}
