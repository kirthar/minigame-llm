import type { UnitView } from "./Agent.ts";
import type { Vec2 } from "../domain/types.ts";
import type { Rng } from "../engine/rng.ts";
import { add, clampToField, distance, lerp, normalize, scale, sub } from "../engine/geometry.ts";
import type { StrategyProfile } from "./utilityProfile.ts";

export interface Group {
  units: UnitView[];
  centroid: Vec2;
}

function centroidOf(units: readonly UnitView[]): Vec2 {
  const sum = units.reduce((acc, u) => ({ x: acc.x + u.pos.x, y: acc.y + u.pos.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / units.length, y: sum.y / units.length };
}

/**
 * Agrupamiento ligero (k-means, 3 iteraciones) de las unidades propias en
 * grupos tácticos. O(k·n), trivial incluso a 60-90 unidades.
 */
export function clusterUnits(units: readonly UnitView[], rng: Rng): Group[] {
  const n = units.length;
  if (n === 0) return [];
  const k = Math.max(1, Math.min(8, Math.round(Math.sqrt(n / 2))));
  if (k <= 1 || n <= k) {
    return [{ units: [...units], centroid: centroidOf(units) }];
  }

  let centroids: Vec2[] = [];
  const usedIdx = new Set<number>();
  while (centroids.length < k) {
    const idx = rng.int(0, n - 1);
    if (usedIdx.has(idx)) continue;
    usedIdx.add(idx);
    centroids.push({ ...units[idx].pos });
  }

  let assignment = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distance(units[i].pos, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      assignment[i] = best;
    }
    const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const c = assignment[i];
      sums[c].x += units[i].pos.x;
      sums[c].y += units[i].pos.y;
      sums[c].count++;
    }
    centroids = sums.map((s, idx) => (s.count > 0 ? { x: s.x / s.count, y: s.y / s.count } : centroids[idx]));
  }

  const groups: Group[] = Array.from({ length: k }, () => ({ units: [], centroid: { x: 0, y: 0 } }));
  for (let i = 0; i < n; i++) groups[assignment[i]].units.push(units[i]);
  for (let c = 0; c < k; c++) {
    groups[c].centroid = groups[c].units.length > 0 ? centroidOf(groups[c].units) : centroids[c];
  }
  return groups.filter((g) => g.units.length > 0);
}

export type GroupIntent = "engage" | "flank" | "retreat" | "regroup" | "reserve";

function isolationPenalty(group: Group, allGroups: readonly Group[], fieldSize: number): number {
  if (allGroups.length <= 1) return 0;
  let minDist = Infinity;
  for (const g of allGroups) {
    if (g === group) continue;
    const d = distance(group.centroid, g.centroid);
    if (d < minDist) minDist = d;
  }
  return Math.min(1, minDist / (fieldSize * 0.3));
}

/** Puntúa las 5 intenciones posibles para un grupo y devuelve la de mayor puntuación. */
export function scoreGroupIntent(
  group: Group,
  profile: StrategyProfile,
  enemies: readonly UnitView[],
  allGroups: readonly Group[],
  fieldSize: number,
  turnsLeftFrac: number,
  rng: Rng,
): GroupIntent {
  const groupStrength = group.units.reduce((s, u) => s + u.cost * u.hpFrac, 0);
  const threats = enemies.filter((e) => distance(e.pos, group.centroid) <= fieldSize * 0.25);
  const localEnemyStrength = threats.reduce((s, e) => s + e.cost * e.hpFrac, 0);
  const forceRatio = groupStrength / Math.max(1, localEnemyStrength);

  let nearestThreat: UnitView | null = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    const d = distance(group.centroid, e.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearestThreat = e;
    }
  }
  const nearestThreatHpFrac = nearestThreat?.hpFrac ?? 1;
  const avgHpFrac = group.units.reduce((s, u) => s + u.hpFrac, 0) / group.units.length;

  const scores: Record<GroupIntent, number> = {
    engage:
      1.2 * profile.aggression +
      0.5 * profile.opportunism * (1 - nearestThreatHpFrac) +
      0.8 * (forceRatio - 1),
    flank: 1.0 * profile.mobility + (forceRatio > 0.8 ? 0.3 : -0.2),
    retreat: 1.3 * profile.caution + 1.0 * (1 - forceRatio) + 0.8 * (1 - avgHpFrac),
    regroup: 1.0 * profile.cohesion + isolationPenalty(group, allGroups, fieldSize),
    reserve: 0.5 * profile.caution + 0.4 * profile.opportunism * (turnsLeftFrac > 0.5 ? 1 : 0),
  };

  let best: GroupIntent = "engage";
  let bestScore = -Infinity;
  for (const key of Object.keys(scores) as GroupIntent[]) {
    const s = scores[key] + (rng.next() - 0.5) * 1e-6; // desempate estable con jitter mínimo
    if (s > bestScore) {
      bestScore = s;
      best = key;
    }
  }
  return best;
}

/** Destino de retirada: se aleja de la amenaza más cercana. */
export function retreatDestination(unit: UnitView, threat: UnitView, fieldSize: number): Vec2 {
  const away = normalize(sub(unit.pos, threat.pos));
  const dest = add(unit.pos, scale(away, unit.stats.move * 1.5));
  return clampToField(dest, fieldSize);
}

/** Destino de reagrupamiento: se acerca al centroide del grupo objetivo. */
export function regroupDestination(unit: UnitView, targetCentroid: Vec2): Vec2 {
  return lerp(unit.pos, targetCentroid, 0.6);
}

/** Destino de flanqueo: posición lateral respecto a la dirección hacia el enemigo. */
export function flankDestination(
  groupCentroid: Vec2,
  enemyCentroid: Vec2,
  fieldSize: number,
  side: 1 | -1,
): Vec2 {
  const toThreat = normalize(sub(enemyCentroid, groupCentroid));
  const lateral: Vec2 = { x: -toThreat.y, y: toThreat.x };
  const dest = add(
    add(groupCentroid, scale(toThreat, fieldSize * 0.15)),
    scale(lateral, side * fieldSize * 0.2),
  );
  return clampToField(dest, fieldSize);
}

/** Busca un aliado sano razonablemente interpuesto entre la unidad y la amenaza. */
export function findShield(
  unit: UnitView,
  threat: UnitView,
  allies: readonly UnitView[],
): UnitView | null {
  const toThreat = normalize(sub(threat.pos, unit.pos));
  let best: UnitView | null = null;
  let bestScore = -Infinity;
  for (const ally of allies) {
    if (ally.id === unit.id || ally.hpFrac <= 0.4) continue;
    const toAlly = normalize(sub(ally.pos, unit.pos));
    const dot = toThreat.x * toAlly.x + toThreat.y * toAlly.y;
    if (dot <= 0.5) continue;
    const score = dot - distance(unit.pos, ally.pos) * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = ally;
    }
  }
  return best;
}

/** Destino para esconderse tras un aliado (posición entre la unidad y su escudo). */
export function hideBehindAllyDestination(unit: UnitView, shield: UnitView): Vec2 {
  return lerp(shield.pos, unit.pos, 0.3);
}

const BETRAYAL_THRESHOLD = 25;

/**
 * Decide si un objetivo aliado/perdonado debe excluirse del fuego, o si el
 * beneficio de traicionar (objetivo caro y muy debilitado, alta oportunidad,
 * baja inclinación diplomática, poca reputación propia que perder) lo justifica.
 */
export function computeBetrayalPayoff(
  target: UnitView,
  profile: StrategyProfile,
  ownReputation: number,
): number {
  return (
    0.5 * target.cost * (1 - target.hpFrac) +
    30 * profile.opportunism -
    40 * profile.diplomacy -
    20 * ownReputation
  );
}

export function isTargetExcluded(
  target: UnitView,
  alliedOrSpared: boolean,
  profile: StrategyProfile,
  ownReputation: number,
): boolean {
  if (!alliedOrSpared) return false;
  return computeBetrayalPayoff(target, profile, ownReputation) <= BETRAYAL_THRESHOLD;
}

/** Objetivo de fuego concentrado: prioriza baja vida y rango alto. */
export function pickFocusFireTarget(
  unit: UnitView,
  enemies: readonly UnitView[],
  profile: StrategyProfile,
): UnitView | null {
  let best: UnitView | null = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    const d = distance(unit.pos, e.pos);
    let score = d - 40 * profile.opportunism * (1 - e.hpFrac);
    if (e.rank >= 3) score -= 60;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}
