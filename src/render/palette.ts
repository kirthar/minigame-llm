/** Colores por ejército (hasta 6). Índice = armyId. */
export const ARMY_COLORS: readonly string[] = [
  "#4da3ff", // azul
  "#ff6b6b", // rojo
  "#7ee787", // verde
  "#ffd166", // amarillo
  "#d2a8ff", // morado
  "#ff9f6b", // naranja
];

/** Grosor de borde según el rango (1..5). */
export function borderWidthForRank(rank: number): number {
  return rank * 2; // 2, 4, 6, 8, 10 px
}
