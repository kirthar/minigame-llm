import type { UnitId, UnitType, Vec2 } from "../domain/types.ts";

/** Tipos de orden que una unidad puede recibir en un turno. */
export enum OrderType {
  /** Atacar a un objetivo concreto, o al enemigo más cercano si no se indica. */
  Attack = "ATTACK",
  /** Desplazarse hacia una posición. */
  Move = "MOVE",
  /** Escoltar/proteger a una unidad aliada (moverse hacia ella y atacar cerca). */
  Defend = "DEFEND",
  /** Intentar capturar a una unidad enemiga. */
  Capture = "CAPTURE",
  /** Quedarse quieta (mantener posición) y atacar a lo que entre en rango. */
  Hold = "HOLD",
}

export type Order =
  | { kind: OrderType.Attack; targetId?: UnitId }
  | { kind: OrderType.Move; to: Vec2 }
  | { kind: OrderType.Defend; allyId: UnitId }
  | { kind: OrderType.Capture; targetId: UnitId }
  | { kind: OrderType.Hold };

/**
 * Órdenes emitidas por un agente en un turno, con alcance por-unidad, por-tipo
 * o global. Precedencia al aplanar: unidad > tipo > global.
 */
export interface OrderSet {
  global?: Order;
  byType?: Partial<Record<UnitType, Order>>;
  byUnit?: Record<UnitId, Order>;
}

/** Resuelve la orden concreta de una unidad aplicando la precedencia. */
export function resolveOrder(
  set: OrderSet,
  unitId: UnitId,
  unitType: UnitType,
): Order {
  return (
    set.byUnit?.[unitId] ??
    set.byType?.[unitType] ??
    set.global ?? { kind: OrderType.Hold }
  );
}
