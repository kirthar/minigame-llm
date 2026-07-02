import type { Rank } from "../domain/types.ts";

/**
 * Escalado por rango. Un rango mejora mucho la calidad (stats) a cambio de un
 * coste bastante mayor. Los arrays están indexados por rango-1 (índice 0 = rango 1).
 */

/** Multiplicador aplicado a hp/ataque según el rango. */
export const STAT_MULTIPLIER: readonly number[] = [1.0, 1.35, 1.8, 2.4, 3.2];

/** Multiplicador aplicado al coste base según el rango. */
export const COST_MULTIPLIER: readonly number[] = [1.0, 1.7, 2.7, 4.0, 5.6];

/**
 * XP acumulada necesaria para ALCANZAR cada rango. Índice = rango-1.
 * Una unidad de rango 1 sube a 2 al alcanzar RANK_XP_THRESHOLD[1], etc.
 */
export const RANK_XP_THRESHOLD: readonly number[] = [0, 10, 25, 50, 90];

export function statMultiplier(rank: Rank): number {
  return STAT_MULTIPLIER[rank - 1];
}

export function costMultiplier(rank: Rank): number {
  return COST_MULTIPLIER[rank - 1];
}

/** XP total necesaria para tener el rango dado. */
export function xpThresholdFor(rank: Rank): number {
  return RANK_XP_THRESHOLD[rank - 1];
}
