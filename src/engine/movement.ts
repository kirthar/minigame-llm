import type { Unit } from "../domain/Unit.ts";
import type { ArmyId, Vec2 } from "../domain/types.ts";
import { OrderType, type Order } from "../orders/orders.ts";
import { clampToField, distance, lerp, normalize, sub } from "./geometry.ts";

/** Enemigo vivo más cercano a `unit` (distinto ejército), o null. */
export function nearestEnemy(unit: Unit, units: readonly Unit[]): Unit | null {
  let best: Unit | null = null;
  let bestDist = Infinity;
  for (const other of units) {
    if (!other.alive || other.armyId === unit.armyId) continue;
    const d = distance(unit.pos, other.pos);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }
  return best;
}

function byId(units: readonly Unit[], id: string): Unit | undefined {
  return units.find((u) => u.alive && u.id === id);
}

/**
 * Punto al que la unidad querría dirigirse según su orden, o null si debe
 * quedarse quieta. Para órdenes de ataque/captura busca acercarse al objetivo.
 */
export function desiredDestination(
  unit: Unit,
  order: Order,
  units: readonly Unit[],
): Vec2 | null {
  switch (order.kind) {
    case OrderType.Move:
      return order.to;
    case OrderType.Hold:
      return null;
    case OrderType.Defend: {
      const ally = byId(units, order.allyId);
      return ally ? ally.pos : null;
    }
    case OrderType.Capture: {
      const target = byId(units, order.targetId);
      return target ? target.pos : null;
    }
    case OrderType.Attack: {
      const target = order.targetId
        ? byId(units, order.targetId)
        : nearestEnemy(unit, units);
      return target ? target.pos : null;
    }
  }
}

/**
 * Mueve `unit` hacia `dest` sin superar su alcance de movimiento. Si va a
 * atacar/capturar y ya está dentro de `stopWithin`, se detiene para no solaparse.
 * Actualiza `pos` y `distanceMovedThisTurn`.
 */
export function moveToward(
  unit: Unit,
  dest: Vec2,
  fieldSize: number,
  stopWithin = 0,
): void {
  const toDest = sub(dest, unit.pos);
  const distToDest = Math.hypot(toDest.x, toDest.y);
  const travel = Math.max(0, Math.min(unit.stats().move, distToDest - stopWithin));
  if (travel <= 0) {
    unit.distanceMovedThisTurn = 0;
    return;
  }
  const dir = normalize(toDest);
  const next = clampToField(
    { x: unit.pos.x + dir.x * travel, y: unit.pos.y + dir.y * travel },
    fieldSize,
  );
  unit.distanceMovedThisTurn = distance(unit.pos, next);
  unit.pos = next;
}

/** Reexport de utilidades usadas por la simulación para interpolar animación. */
export { lerp };

/**
 * Índice de las unidades vivas por ejército, útil para heurísticas y render.
 */
export function groupByArmy(units: readonly Unit[]): Map<ArmyId, Unit[]> {
  const map = new Map<ArmyId, Unit[]>();
  for (const u of units) {
    if (!u.alive) continue;
    const list = map.get(u.armyId) ?? [];
    list.push(u);
    map.set(u.armyId, list);
  }
  return map;
}
