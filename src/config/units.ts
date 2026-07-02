import { Shape, UnitType, type UnitTypeDef } from "../domain/types.ts";

/**
 * Stats base (rango 1) y costes de cada tipo de tropa.
 * Diseño piedra-papel-tijera. Todos los valores son editables aquí sin tocar la
 * lógica del motor.
 */
export const UNIT_DEFS: Record<UnitType, UnitTypeDef> = {
  [UnitType.Archer]: {
    type: UnitType.Archer,
    label: "Arquero",
    shape: Shape.Triangle,
    baseStats: { maxHp: 8, attack: 4, range: 20, move: 6, armor: 0 },
    baseCost: 12,
    // Kitea y castiga a la infantería pesada.
    damageBonusVs: { [UnitType.Heavy]: 1.5 },
    chargeBonusPerDistance: 0,
  },
  [UnitType.Light]: {
    type: UnitType.Light,
    label: "Inf. ligera",
    shape: Shape.Circle,
    baseStats: { maxHp: 10, attack: 3, range: 3, move: 8, armor: 0 },
    baseCost: 6,
    // Barata y numerosa; cierra distancias con los arqueros.
    damageBonusVs: { [UnitType.Archer]: 1.25 },
    chargeBonusPerDistance: 0,
  },
  [UnitType.Heavy]: {
    type: UnitType.Heavy,
    label: "Inf. pesada",
    shape: Shape.Square,
    baseStats: { maxHp: 20, attack: 5, range: 3, move: 4, armor: 2 },
    baseCost: 15,
    // Muro anti-carga contra caballería.
    damageBonusVs: { [UnitType.Cavalry]: 1.5 },
    chargeBonusPerDistance: 0,
  },
  [UnitType.Cavalry]: {
    type: UnitType.Cavalry,
    label: "Caballería",
    shape: Shape.Diamond,
    baseStats: { maxHp: 14, attack: 7, range: 3, move: 12, armor: 1 },
    baseCost: 20,
    // Arrolla a tropas ligeras y a arqueros.
    damageBonusVs: { [UnitType.Archer]: 1.5, [UnitType.Light]: 1.5 },
    chargeBonusPerDistance: 0.15,
  },
};
