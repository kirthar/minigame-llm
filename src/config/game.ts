/** Parámetros globales de la partida. Editables sin tocar la lógica. */
export const GAME_CONFIG = {
  /** Puntos disponibles para formar cada ejército en la fase de preparación. */
  budget: 100,
  /** Número máximo de turnos de la fase de batalla. */
  maxTurns: 30,
  /** Lado del campo de batalla (cuadrado) en unidades de mundo. */
  fieldSize: 720,
  /** Nº de ejércitos por defecto (configurable entre min y max). */
  defaultArmies: 4,
  minArmies: 2,
  maxArmies: 6,
  /**
   * Los ejércitos aparecen equidistantes sobre un círculo de este radio
   * (fracción de la mitad del campo).
   */
  spawnRadiusFactor: 0.82,
  /** Separación entre las unidades de un mismo ejército en su formación inicial. */
  formationSpacing: 26,
} as const;

/**
 * XP otorgada a la unidad que remata a un enemigo, en función del valor de la
 * víctima (su coste en puntos ya escalado por rango).
 */
export const XP_PER_KILL_COST_FACTOR = 0.6;
