import type { Unit } from "../domain/Unit.ts";
import type { UnitType } from "../domain/types.ts";

/** Multiplicador de daño del atacante frente al tipo del defensor (1 = neutro). */
export function typeBonus(attackerType: UnitType, defenderType: UnitType): number {
  const defs = attackerDefs(attackerType);
  return defs.damageBonusVs[defenderType] ?? 1;
}

// Import diferido para evitar ciclos: leemos las defs desde config.
import { UNIT_DEFS } from "../config/units.ts";
function attackerDefs(type: UnitType) {
  return UNIT_DEFS[type];
}

/**
 * Daño que `attacker` inflige a `defender`. Incluye bonus por tipo y, para la
 * caballería, un bonus de carga proporcional a la distancia recorrida en la fase
 * de movimiento de este turno. La armadura reduce el daño de forma plana.
 */
export function computeDamage(attacker: Unit, defender: Unit): number {
  const atk = attacker.stats().attack;
  const bonus = typeBonus(attacker.type, defender.type);
  const charge = attacker.def.chargeBonusPerDistance * attacker.distanceMovedThisTurn;
  const raw = atk * bonus + charge;
  const armor = defender.stats().armor;
  return Math.max(1, Math.round(raw - armor));
}

/**
 * Probabilidad de éxito de una captura en función de la diferencia de rangos.
 * Ventaja de +2 rangos = éxito seguro (1.0); desventaja de −2 = imposible (0.0).
 */
export function captureProbability(attackerRank: number, defenderRank: number): number {
  const p = 0.5 + 0.25 * (attackerRank - defenderRank);
  return Math.max(0, Math.min(1, p));
}
