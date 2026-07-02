import { captureProbability } from "../engine/combat.ts";
import { distance } from "../engine/geometry.ts";
import type { Rng } from "../engine/rng.ts";
import { type ArmyId, type Rank, UnitType } from "../domain/types.ts";
import { OrderType, type Order, type OrderSet } from "../orders/orders.ts";
import type {
  Agent,
  ArmyBlueprint,
  ArmyBuildContext,
  BattlefieldView,
  DiplomacyIntent,
  UnitView,
} from "./Agent.ts";
import {
  driftProfile,
  initProfile,
  relativeStrengthOf,
  type StrategyProfile,
} from "./utilityProfile.ts";
import {
  clusterUnits,
  findShield,
  flankDestination,
  type Group,
  type GroupIntent,
  hideBehindAllyDestination,
  isTargetExcluded,
  pickFocusFireTarget,
  regroupDestination,
  retreatDestination,
  scoreGroupIntent,
} from "./utilityTactics.ts";

const RANK_MIX: readonly number[] = [0.55, 0.25, 0.12, 0.06, 0.02];
const ROUT_THRESHOLD = 0.25;
const ALLY_PROPOSAL_DIPLOMACY = 0.55;
const ALLY_BREAK_CAUTION = 0.7;
const ALLY_BREAK_STRENGTH_RATIO = 1.8;

/**
 * IA de utilidad: sin doctrinas con nombre. Cada ejército mantiene un perfil
 * numérico persistente que sesga sus decisiones y deriva según la marcha de
 * la batalla, produciendo retiradas, flanqueos, emboscadas, protección de
 * aliados, alianzas y traiciones de forma emergente.
 */
export class UtilityAgent implements Agent {
  readonly name: string;
  private profile: StrategyProfile | null = null;
  private initialStrength = 1;
  /** Ejércitos a los que esta IA perdona unilateralmente (sin pacto formal). */
  private readonly spared = new Set<ArmyId>();

  constructor(name?: string) {
    this.name = name ?? "Utilidad";
  }

  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    const types = [UnitType.Archer, UnitType.Light, UnitType.Heavy, UnitType.Cavalry];
    const weights = types.map(() => 0.8 + ctx.rng.next() * 0.6);
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const blueprint: ArmyBlueprint = [];
    let spent = 0;
    const cheapestCost = ctx.costOf(UnitType.Light, 1);

    while (spent + cheapestCost <= ctx.budget) {
      const type = pickWeighted(types, weights, totalWeight, ctx.rng);
      const rank = pickRank(ctx.rng);
      const cost = ctx.costOf(type, rank);
      if (spent + cost <= ctx.budget) {
        blueprint.push({ type, rank });
        spent += cost;
      } else {
        blueprint.push({ type: UnitType.Light, rank: 1 });
        spent += cheapestCost;
      }
    }
    return blueprint;
  }

  onBattleStart(view: BattlefieldView): void {
    const own = view.own();
    const rel = relativeStrengthOf(view);
    this.profile = initProfile(own, rel, view.rng);
    this.initialStrength = view.armyStrength(view.selfArmyId);
  }

  planDiplomacy(view: BattlefieldView): DiplomacyIntent[] {
    const profile = this.ensureProfile(view);
    const intents: DiplomacyIntent[] = [];
    const armyIds = new Set(view.units.map((u) => u.armyId));
    const strengths = new Map<ArmyId, number>();
    for (const id of armyIds) strengths.set(id, view.armyStrength(id));
    const selfStrength = strengths.get(view.selfArmyId) ?? 0;

    let biggestThreat: ArmyId | null = null;
    let biggestThreatStrength = -1;
    for (const [id, s] of strengths) {
      if (id === view.selfArmyId) continue;
      if (s > biggestThreatStrength) {
        biggestThreatStrength = s;
        biggestThreat = id;
      }
    }

    for (const [id, strength] of strengths) {
      if (id === view.selfArmyId) continue;
      const allied = this.isAlliedWith(view, id);
      const reputation = view.reputations[id] ?? 0;
      if (
        !allied &&
        profile.diplomacy > ALLY_PROPOSAL_DIPLOMACY &&
        id !== biggestThreat &&
        reputation === 0
      ) {
        intents.push({ kind: "propose", withArmyId: id });
      }
      if (allied && profile.caution > ALLY_BREAK_CAUTION && strength > selfStrength * ALLY_BREAK_STRENGTH_RATIO) {
        intents.push({ kind: "break", withArmyId: id });
      }
    }
    return intents;
  }

  planTurn(view: BattlefieldView): OrderSet {
    const profile = this.ensureProfile(view);
    const rel = relativeStrengthOf(view);
    const turnsLeftFrac = (view.maxTurns - view.turn) / Math.max(1, view.maxTurns);
    const drifted = driftProfile(profile, rel, turnsLeftFrac);
    Object.assign(profile, drifted);

    const own = view.own();
    const enemies = view.enemies();
    if (own.length === 0 || enemies.length === 0) {
      return { global: { kind: OrderType.Hold } };
    }

    const strengthNow = view.armyStrength(view.selfArmyId);
    const routed = strengthNow / Math.max(1, this.initialStrength) < ROUT_THRESHOLD;
    if (routed) profile.caution = Math.min(1, profile.caution + 0.3);

    this.updateSparedArmies(view, profile);

    const groups = clusterUnits(own, view.rng);
    const byUnit: Record<string, Order> = {};

    groups.forEach((group, groupIndex) => {
      let intent = scoreGroupIntent(
        group,
        profile,
        enemies,
        groups,
        view.fieldSize,
        turnsLeftFrac,
        view.rng,
      );
      const groupStrength = group.units.reduce((s, u) => s + u.cost * u.hpFrac, 0);
      const nearbyEnemyStrength = enemies
        .filter((e) => distance(e.pos, group.centroid) <= view.fieldSize * 0.25)
        .reduce((s, e) => s + e.cost * e.hpFrac, 0);
      const localForceRatio = groupStrength / Math.max(1, nearbyEnemyStrength);
      if (routed && localForceRatio <= 2) intent = "retreat";

      this.assignGroupOrders(group, intent, groupIndex, groups, view, profile, byUnit);
    });

    this.assignGuardOrders(own, byUnit, view.fieldSize);

    return { byUnit };
  }

  // --- Órdenes por grupo/unidad ---

  private assignGroupOrders(
    group: Group,
    intent: GroupIntent,
    groupIndex: number,
    allGroups: Group[],
    view: BattlefieldView,
    profile: StrategyProfile,
    byUnit: Record<string, Order>,
  ): void {
    const enemies = view.enemies();
    const enemyCentroid = centroidOf(enemies.length > 0 ? enemies : group.units);
    const side: 1 | -1 = groupIndex % 2 === 0 ? 1 : -1;
    const strongestGroup = allGroups.reduce((a, b) =>
      b.units.reduce((s, u) => s + u.cost * u.hpFrac, 0) >
      a.units.reduce((s, u) => s + u.cost * u.hpFrac, 0)
        ? b
        : a,
    );

    for (const unit of group.units) {
      switch (intent) {
        case "retreat": {
          byUnit[unit.id] = this.retreatOrHide(unit, view);
          break;
        }
        case "regroup": {
          byUnit[unit.id] = { kind: OrderType.Move, to: regroupDestination(unit, strongestGroup.centroid) };
          break;
        }
        case "flank": {
          byUnit[unit.id] = {
            kind: OrderType.Move,
            to: flankDestination(group.centroid, enemyCentroid, view.fieldSize, side),
          };
          break;
        }
        case "reserve": {
          const threat = view.nearestEnemyTo(unit.pos);
          const hpThreshold = 0.5 - 0.3 * profile.opportunism;
          if (threat && !this.isExcluded(threat, view, profile) && threat.hpFrac < hpThreshold) {
            byUnit[unit.id] = this.engageOrder(unit, threat);
          } else {
            byUnit[unit.id] = { kind: OrderType.Hold };
          }
          break;
        }
        case "engage":
        default: {
          const candidates = enemies.filter((e) => !this.isExcluded(e, view, profile));
          if (candidates.length === 0) {
            // Todos los enemigos visibles son aliados/perdonados y el beneficio
            // de traicionar no compensa: se mantiene la posición sin atacar.
            byUnit[unit.id] = { kind: OrderType.Hold };
            break;
          }
          const target = pickFocusFireTarget(unit, candidates, profile);
          if (target) byUnit[unit.id] = this.engageOrder(unit, target);
          else byUnit[unit.id] = { kind: OrderType.Hold };
          break;
        }
      }
    }
  }

  /** Retirada simple o esconderse tras un aliado, lo que aleje más de la amenaza. */
  private retreatOrHide(unit: UnitView, view: BattlefieldView): Order {
    const threat = view.nearestEnemyTo(unit.pos);
    if (!threat) return { kind: OrderType.Hold };

    const plainDest = retreatDestination(unit, threat, view.fieldSize);
    const plainScore = distance(plainDest, threat.pos);

    const shield = findShield(unit, threat, view.own());
    if (shield) {
      const hideDest = hideBehindAllyDestination(unit, shield);
      const hideScore = distance(hideDest, threat.pos);
      if (hideScore > plainScore) {
        return { kind: OrderType.Move, to: hideDest };
      }
    }
    return { kind: OrderType.Move, to: plainDest };
  }

  private engageOrder(unit: UnitView, target: UnitView): Order {
    if (unit.type !== UnitType.Archer) {
      const d = distance(unit.pos, target.pos);
      const meleeReach = unit.stats.range + unit.stats.move;
      if (captureProbability(unit.rank, target.rank) >= 1 && d <= meleeReach) {
        return { kind: OrderType.Capture, targetId: target.id };
      }
    }
    return { kind: OrderType.Attack, targetId: target.id };
  }

  /** Protege a unidades propias caras y muy debilitadas asignando escoltas ociosas. */
  private assignGuardOrders(
    own: readonly UnitView[],
    byUnit: Record<string, Order>,
    fieldSize: number,
  ): void {
    const costs = [...own.map((u) => u.cost)].sort((a, b) => a - b);
    if (costs.length === 0) return;
    const p75 = costs[Math.floor(costs.length * 0.75)];
    const priority = own.filter((u) => u.cost >= p75 && u.hpFrac < 0.3);

    for (const vip of priority) {
      const nearbyIdle = own
        .filter((u) => u.id !== vip.id && byUnit[u.id]?.kind === OrderType.Hold)
        .filter((u) => distance(u.pos, vip.pos) <= fieldSize * 0.2)
        .slice(0, 2);
      for (const guard of nearbyIdle) {
        byUnit[guard.id] = { kind: OrderType.Defend, allyId: vip.id };
      }
    }
  }

  // --- Diplomacia / exclusión de objetivos ---

  /**
   * "Clemencia" unilateral sin pacto formal: perdona a ejércitos claramente
   * débiles y sin historial de traición cuando el perfil es lo bastante
   * diplomático. Se recalcula cada turno a partir del estado actual (no
   * arrastra rencor de turnos previos, solo lo ya cubierto por `reputations`).
   */
  private updateSparedArmies(view: BattlefieldView, profile: StrategyProfile): void {
    this.spared.clear();
    const armyIds = new Set(view.units.map((u) => u.armyId));
    const selfStrength = view.armyStrength(view.selfArmyId);
    for (const id of armyIds) {
      if (id === view.selfArmyId || this.isAlliedWith(view, id)) continue;
      const theirStrength = view.armyStrength(id);
      const reputation = view.reputations[id] ?? 0;
      if (reputation === 0 && theirStrength < selfStrength * 0.15 && profile.diplomacy > 0.4) {
        this.spared.add(id);
      }
    }
  }

  private isAlliedWith(view: BattlefieldView, armyId: ArmyId): boolean {
    return view.alliances.some(
      ([a, b]) =>
        (a === view.selfArmyId && b === armyId) || (b === view.selfArmyId && a === armyId),
    );
  }

  /** Excluye objetivos aliados/perdonados salvo que el beneficio de traicionar supere el umbral. */
  private isExcluded(target: UnitView, view: BattlefieldView, profile: StrategyProfile): boolean {
    const alliedOrSpared =
      this.isAlliedWith(view, target.armyId) || this.spared.has(target.armyId);
    const ownReputation = view.reputations[view.selfArmyId] ?? 0;
    return isTargetExcluded(target, alliedOrSpared, profile, ownReputation);
  }

  private ensureProfile(view: BattlefieldView): StrategyProfile {
    if (!this.profile) {
      this.profile = initProfile(view.own(), relativeStrengthOf(view), view.rng);
      this.initialStrength = view.armyStrength(view.selfArmyId) || 1;
    }
    return this.profile;
  }
}

function centroidOf(units: readonly UnitView[]) {
  const sum = units.reduce((acc, u) => ({ x: acc.x + u.pos.x, y: acc.y + u.pos.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / units.length, y: sum.y / units.length };
}

function pickWeighted(
  types: readonly UnitType[],
  weights: readonly number[],
  totalWeight: number,
  rng: Rng,
): UnitType {
  let r = rng.next() * totalWeight;
  for (let i = 0; i < types.length; i++) {
    r -= weights[i];
    if (r <= 0) return types[i];
  }
  return types[types.length - 1];
}

function pickRank(rng: Rng): Rank {
  let r = rng.next();
  for (let i = 0; i < RANK_MIX.length; i++) {
    r -= RANK_MIX[i];
    if (r <= 0) return (i + 1) as Rank;
  }
  return 1 as Rank;
}
