/** Parámetros globales de la partida. Editables sin tocar la lógica. */
export const GAME_CONFIG = {
  /** Puntos disponibles para formar cada ejército en la fase de preparación. */
  budget: 1600,
  /** Número máximo de turnos de la fase de batalla (valor por defecto; ajustable en UI). */
  maxTurns: 30,
  /** Límite inferior del control de turnos en la UI. */
  minTurns: 10,
  /** Límite superior del control de turnos en la UI. */
  maxTurnsLimit: 200,
  /** Lado del campo de batalla (cuadrado) en unidades de mundo. */
  fieldSize: 1200,
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
