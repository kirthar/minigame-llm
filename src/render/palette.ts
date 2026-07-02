/** Colores por ejército (hasta 6). Índice = armyId. */
export const ARMY_COLORS: readonly string[] = [
  "#4da3ff", // azul
  "#ff6b6b", // rojo
  "#7ee787", // verde
  "#ffd166", // amarillo
  "#d2a8ff", // morado
  "#ff9f6b", // naranja
];

/**
 * Grosor de borde según el rango (1..5). Acotado para no devorar el relleno
 * de color en unidades pequeñas (UNIT_RADIUS=7): el número de rango dentro
 * de la figura es ya el indicador principal; el borde es solo un refuerzo.
 */
export function borderWidthForRank(rank: number): number {
  return rank; // 1, 2, 3, 4, 5 px
}
