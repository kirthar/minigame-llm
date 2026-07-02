import { captureProbability } from "../engine/combat.ts";
import { distance } from "../engine/geometry.ts";
import { UnitType, type Rank } from "../domain/types.ts";
import { OrderType, type Order, type OrderSet } from "../orders/orders.ts";
import type {
  Agent,
  ArmyBlueprint,
  ArmyBuildContext,
  BattlefieldView,
  UnitView,
} from "./Agent.ts";

export type Doctrine = "balanced" | "cavalry" | "ranged";

/** Lista de compra (tipo, rango) según la doctrina; se recorre en bucle. */
const WISHLISTS: Record<Doctrine, Array<{ type: UnitType; rank: Rank }>> = {
  balanced: [
    { type: UnitType.Heavy, rank: 2 },
    { type: UnitType.Archer, rank: 1 },
    { type: UnitType.Cavalry, rank: 1 },
    { type: UnitType.Light, rank: 1 },
    { type: UnitType.Archer, rank: 1 },
    { type: UnitType.Light, rank: 1 },
  ],
  cavalry: [
    { type: UnitType.Cavalry, rank: 2 },
    { type: UnitType.Cavalry, rank: 1 },
    { type: UnitType.Light, rank: 1 },
    { type: UnitType.Light, rank: 1 },
  ],
  ranged: [
    { type: UnitType.Archer, rank: 2 },
    { type: UnitType.Heavy, rank: 1 },
    { type: UnitType.Archer, rank: 1 },
    { type: UnitType.Light, rank: 1 },
  ],
};

/**
 * IA "estática" v0.0.1. Implementa la interfaz Agent mediante heurísticas
 * deterministas. Sustituible por un agente remoto/LLM sin tocar el motor.
 */
export class HeuristicAgent implements Agent {
  readonly name: string;
  private readonly doctrine: Doctrine;

  constructor(doctrine: Doctrine = "balanced", name?: string) {
    this.doctrine = doctrine;
    this.name = name ?? `Heurístico (${doctrine})`;
  }

  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    const blueprint: ArmyBlueprint = [];
    let spent = 0;
    const wishlist = WISHLISTS[this.doctrine];

    // Recorre la lista de deseos en bucle mientras quepan compras.
    let boughtInPass = true;
    while (boughtInPass) {
      boughtInPass = false;
      for (const entry of wishlist) {
        const cost = ctx.costOf(entry.type, entry.rank);
        if (spent + cost <= ctx.budget) {
          blueprint.push({ ...entry });
          spent += cost;
          boughtInPass = true;
        }
      }
    }

    // Rellena lo que quede con la tropa más barata (infantería ligera rango 1).
    const cheapest = ctx.costOf(UnitType.Light, 1);
    while (spent + cheapest <= ctx.budget) {
      blueprint.push({ type: UnitType.Light, rank: 1 });
      spent += cheapest;
    }
    return blueprint;
  }

  planTurn(view: BattlefieldView): OrderSet {
    const own = view.own();
    const enemies = view.enemies();
    const byUnit: Record<string, Order> = {};

    if (enemies.length === 0) {
      return { global: { kind: OrderType.Hold } };
    }

    for (const unit of own) {
      byUnit[unit.id] = this.decideUnitOrder(unit, enemies);
    }
    return { byUnit };
  }

  private decideUnitOrder(unit: UnitView, enemies: UnitView[]): Order {
    // La caballería prioriza objetivos blandos (arqueros e infantería ligera).
    const preferSoft = unit.type === UnitType.Cavalry;
    const target = this.pickTarget(unit, enemies, preferSoft);

    // Si hay una ventaja de rango decisiva y el objetivo está a tiro corto,
    // intenta capturarlo en vez de matarlo.
    const d = distance(unit.pos, target.pos);
    const meleeReach = unit.stats.range + unit.stats.move;
    if (
      captureProbability(unit.rank, target.rank) >= 1 &&
      d <= meleeReach &&
      unit.type !== UnitType.Archer
    ) {
      return { kind: OrderType.Capture, targetId: target.id };
    }

    return { kind: OrderType.Attack, targetId: target.id };
  }

  private pickTarget(
    unit: UnitView,
    enemies: UnitView[],
    preferSoft: boolean,
  ): UnitView {
    const soft = new Set<UnitType>([UnitType.Archer, UnitType.Light]);
    let best = enemies[0];
    let bestScore = Infinity;
    for (const e of enemies) {
      const d = distance(unit.pos, e.pos);
      // Menor distancia y (si aplica) menor vida hacen mejor objetivo.
      let score = d + e.hp * 0.5;
      if (preferSoft && soft.has(e.type)) score -= 200;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }
}
