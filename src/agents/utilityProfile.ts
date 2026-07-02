import type { BattlefieldView, UnitView } from "./Agent.ts";
import type { Rng } from "../engine/rng.ts";
import { UnitType } from "../domain/types.ts";

/**
 * Perfil de estrategia de un ejército: pesos numéricos persistentes (no una
 * doctrina con nombre) que sesgan las decisiones turno a turno y derivan
 * según la marcha de la batalla.
 */
export interface StrategyProfile {
  aggression: number;
  caution: number;
  opportunism: number;
  cohesion: number;
  mobility: number;
  diplomacy: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const JITTER = 0.15;

/** Fuerza propia relativa a la suma de fuerza de todos los ejércitos enemigos vivos. */
export function relativeStrengthOf(view: BattlefieldView): number {
  const selfStrength = view.armyStrength(view.selfArmyId);
  const armyIds = new Set(view.units.map((u) => u.armyId));
  let enemyTotal = 0;
  for (const id of armyIds) {
    if (id !== view.selfArmyId) enemyTotal += view.armyStrength(id);
  }
  return selfStrength / Math.max(1, enemyTotal);
}

/** Inicializa el perfil a partir de la composición propia + jitter determinista (semillado). */
export function initProfile(
  own: readonly UnitView[],
  relativeInitialStrength: number,
  rng: Rng,
): StrategyProfile {
  const total = own.length || 1;
  const fracOf = (t: UnitType) => own.filter((u) => u.type === t).length / total;
  const fracCavalry = fracOf(UnitType.Cavalry);
  const fracHeavy = fracOf(UnitType.Heavy);
  const fracArcher = fracOf(UnitType.Archer);
  const avgRank = own.reduce((s, u) => s + u.rank, 0) / total;
  const jitter = () => (rng.next() - 0.5) * JITTER;

  return {
    aggression: clamp01(0.3 + 0.4 * fracCavalry + 0.1 * (avgRank / 5) + jitter()),
    caution: clamp01(0.3 + 0.4 * fracHeavy - 0.2 * fracCavalry + jitter()),
    opportunism: clamp01(0.4 + 0.3 * fracArcher + jitter()),
    cohesion: clamp01(0.5 - 0.3 * fracCavalry + 0.2 * fracHeavy + jitter()),
    mobility: clamp01(0.3 + 0.5 * fracCavalry + jitter()),
    diplomacy: clamp01(0.5 - 0.4 * relativeInitialStrength + jitter()),
  };
}

const DRIFT_RATE = 0.08;

/** Deriva suave del perfil hacia la situación actual de la batalla. */
export function driftProfile(
  profile: StrategyProfile,
  relativeStrength: number,
  turnsLeftFrac: number,
): StrategyProfile {
  return {
    ...profile,
    caution: clamp01(
      profile.caution + DRIFT_RATE * (1 - relativeStrength - profile.caution),
    ),
    aggression: clamp01(
      profile.aggression + DRIFT_RATE * (relativeStrength - profile.aggression),
    ),
    opportunism: clamp01(
      profile.opportunism +
        DRIFT_RATE * (1 - turnsLeftFrac - profile.opportunism * 0.3),
    ),
    diplomacy: clamp01(
      profile.diplomacy +
        DRIFT_RATE * ((1 - relativeStrength) * 0.5 - profile.diplomacy * 0.2),
    ),
  };
}
