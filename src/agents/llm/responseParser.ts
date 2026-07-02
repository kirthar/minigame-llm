/**
 * Parsea y valida la respuesta cruda (texto) de un LLM contra los contratos
 * del juego. La salida de un modelo no es de fiar por construcción (puede
 * venir con prosa alrededor, campos mal escritos, tipos inválidos...), así
 * que cada función aquí es tolerante: descarta silenciosamente cualquier
 * entrada que no encaje en el contrato y, si el parseo global falla del
 * todo, devuelve un valor por defecto seguro en vez de lanzar.
 */
import { OrderType, type Order, type OrderSet } from "../../orders/orders.ts";
import type { ArmyBlueprint } from "../Agent.ts";
import type { DiplomacyIntent } from "../../domain/diplomacy.ts";
import { UnitType, type Rank } from "../../domain/types.ts";

const VALID_UNIT_TYPES = new Set<string>(Object.values(UnitType));
const VALID_ORDER_KINDS = new Set<string>(Object.values(OrderType));

/** Extrae y parsea el primer bloque ```json ... ``` de un texto; si no hay, intenta el texto entero. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  return JSON.parse(text);
}

function isRank(value: unknown): value is Rank {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function isVec2(value: unknown): value is { x: number; y: number } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).x === "number" &&
    typeof (value as Record<string, unknown>).y === "number"
  );
}

function isValidOrder(value: unknown): value is Order {
  if (!value || typeof value !== "object") return false;
  const kind = (value as Record<string, unknown>).kind;
  if (typeof kind !== "string" || !VALID_ORDER_KINDS.has(kind)) return false;
  const v = value as Record<string, unknown>;
  switch (kind as OrderType) {
    case OrderType.Attack:
      return v.targetId === undefined || typeof v.targetId === "string";
    case OrderType.Move:
      return isVec2(v.to);
    case OrderType.Defend:
      return typeof v.allyId === "string";
    case OrderType.Capture:
      return typeof v.targetId === "string";
    case OrderType.Hold:
      return true;
    default:
      return false;
  }
}

/** Parsea un ArmyBlueprint; descarta entradas inválidas; `[]` si el JSON global no es parseable. */
export function parseArmyBlueprint(raw: string): ArmyBlueprint {
  try {
    const data = extractJson(raw);
    if (!Array.isArray(data)) return [];
    const blueprint: ArmyBlueprint = [];
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const { type, rank } = entry as Record<string, unknown>;
      if (typeof type !== "string" || !VALID_UNIT_TYPES.has(type)) continue;
      if (!isRank(rank)) continue;
      blueprint.push({ type: type as UnitType, rank });
    }
    return blueprint;
  } catch {
    return [];
  }
}

/** Parsea un OrderSet; descarta entradas inválidas; `{global: Hold}` si el JSON global no es parseable. */
export function parseOrderSet(raw: string): OrderSet {
  try {
    const data = extractJson(raw);
    if (!data || typeof data !== "object") return { global: { kind: OrderType.Hold } };
    const d = data as Record<string, unknown>;
    const result: OrderSet = {};

    if (isValidOrder(d.global)) result.global = d.global;

    if (d.byType && typeof d.byType === "object") {
      const byType: NonNullable<OrderSet["byType"]> = {};
      for (const [type, order] of Object.entries(d.byType as Record<string, unknown>)) {
        if (VALID_UNIT_TYPES.has(type) && isValidOrder(order)) {
          byType[type as UnitType] = order;
        }
      }
      if (Object.keys(byType).length > 0) result.byType = byType;
    }

    if (d.byUnit && typeof d.byUnit === "object") {
      const byUnit: NonNullable<OrderSet["byUnit"]> = {};
      for (const [unitId, order] of Object.entries(d.byUnit as Record<string, unknown>)) {
        if (isValidOrder(order)) byUnit[unitId] = order;
      }
      if (Object.keys(byUnit).length > 0) result.byUnit = byUnit;
    }

    return result;
  } catch {
    return { global: { kind: OrderType.Hold } };
  }
}

/** Parsea un DiplomacyIntent[]; descarta entradas inválidas; `[]` si el JSON global no es parseable. */
export function parseDiplomacyIntents(raw: string): DiplomacyIntent[] {
  try {
    const data = extractJson(raw);
    if (!Array.isArray(data)) return [];
    const intents: DiplomacyIntent[] = [];
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const { kind, withArmyId } = entry as Record<string, unknown>;
      if ((kind === "propose" || kind === "break") && typeof withArmyId === "number") {
        intents.push({ kind, withArmyId });
      }
    }
    return intents;
  } catch {
    return [];
  }
}
