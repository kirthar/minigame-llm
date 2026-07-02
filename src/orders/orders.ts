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

/**
 * Ataca a un objetivo concreto (`targetId`) si sigue vivo, es enemigo y queda
 * en rango tras el movimiento; si no se indica `targetId`, o el indicado deja
 * de ser válido, la unidad ataca al enemigo vivo más cercano que quede en su
 * rango. La unidad se desplaza primero hasta quedar dentro de su propio rango
 * de ataque del objetivo (o hasta agotar su movimiento).
 */
export interface AttackOrder {
  kind: OrderType.Attack;
  targetId?: UnitId;
}

/** Se desplaza hacia la posición `to` hasta agotar su movimiento de este turno. No ataca. */
export interface MoveOrder {
  kind: OrderType.Move;
  to: Vec2;
}

/**
 * Se desplaza hacia la unidad aliada `allyId` hasta quedar a
 * `GAME_CONFIG.formationSpacing` de distancia, y ataca a cualquier enemigo
 * que quede en su propio rango desde su posición final (igual que `Hold`).
 */
export interface DefendOrder {
  kind: OrderType.Defend;
  allyId: UnitId;
}

/**
 * Intenta capturar a la unidad enemiga `targetId`: se desplaza hasta quedar
 * dentro de su propio rango de ataque y, si lo logra este turno, tira la
 * probabilidad de captura (ver `captureProbability` en `docs/GAME_RULES.md`)
 * en vez de infligir daño. Consume la acción de combate de la unidad aunque
 * el intento falle.
 */
export interface CaptureOrder {
  kind: OrderType.Capture;
  targetId: UnitId;
}

/** Mantiene su posición actual (no se mueve) y ataca a cualquier enemigo que quede en su rango. */
export interface HoldOrder {
  kind: OrderType.Hold;
}

/** Unión discriminada por `kind` de todas las órdenes posibles para una unidad en un turno. */
export type Order =
  | AttackOrder
  | MoveOrder
  | DefendOrder
  | CaptureOrder
  | HoldOrder;

/**
 * Órdenes emitidas por un agente en un turno, con alcance por-unidad, por-tipo
 * o global. Precedencia al aplanar (ver `resolveOrder`): unidad > tipo > global
 * > `Hold` por defecto si no se especifica nada.
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
