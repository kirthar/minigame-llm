/**
 * Formatos JSON-serializables ("DTO") equivalentes a `BattlefieldView` y
 * `ArmyBuildContext`, para agentes que no viven en el mismo proceso que el
 * motor (p. ej. un LLM al otro lado de una llamada HTTP) y por tanto no
 * pueden invocar sus métodos (`own()`, `costOf()`, etc.). `ArmyBlueprint`,
 * `OrderSet` y `DiplomacyIntent[]` ya son datos planos — no necesitan DTO
 * propio, se usan tal cual como formato de salida (ver `docs/AGENT_PROMPT.md`).
 */
import type { ArmyBuildContext, BattlefieldView, UnitView } from "../Agent.ts";
import {
  ALL_UNIT_TYPES,
  type ArmyId,
  type Rank,
  type Stats,
  type UnitType,
} from "../../domain/types.ts";

/** Instantánea JSON-serializable de todo el campo, para el turno actual. */
export interface BattlefieldSnapshotDTO {
  turn: number;
  maxTurns: number;
  fieldSize: number;
  selfArmyId: ArmyId;
  /** Todas las unidades vivas de todos los ejércitos (información perfecta). */
  units: UnitView[];
  alliances: Array<[ArmyId, ArmyId]>;
  reputations: Record<ArmyId, number>;
  /** Precalculado por ejército: Σ coste×hpFrac de sus unidades vivas. */
  armyStrengths: Record<ArmyId, number>;
  /** Precalculado por ejército: nº de unidades vivas. */
  unitCounts: Record<ArmyId, number>;
}

/** Convierte una `BattlefieldView` en vivo en su equivalente JSON plano. */
export function toBattlefieldSnapshot(view: BattlefieldView): BattlefieldSnapshotDTO {
  const armyIds = new Set(view.units.map((u) => u.armyId));
  const armyStrengths: Record<ArmyId, number> = {};
  const unitCounts: Record<ArmyId, number> = {};
  for (const id of armyIds) {
    armyStrengths[id] = view.armyStrength(id);
    unitCounts[id] = view.unitCount(id);
  }
  return {
    turn: view.turn,
    maxTurns: view.maxTurns,
    fieldSize: view.fieldSize,
    selfArmyId: view.selfArmyId,
    units: view.units.map((u) => ({ ...u })),
    alliances: view.alliances.map(([a, b]) => [a, b]),
    reputations: { ...view.reputations },
    armyStrengths,
    unitCounts,
  };
}

/** Una entrada del catálogo: coste y stats exactos de un tipo a un rango dado. */
export interface UnitCatalogEntryDTO {
  type: UnitType;
  rank: Rank;
  cost: number;
  stats: Stats;
}

/** Contexto JSON-serializable de la fase de preparación (ver `ArmyBuildContext`). */
export interface ArmyBuildRequestDTO {
  budget: number;
  selfArmyId: ArmyId;
  armyCount: number;
  fieldSize: number;
  /** Coste y stats de las 4 tropas × 5 rangos = 20 combinaciones, precalculados. */
  unitCatalog: UnitCatalogEntryDTO[];
}

/** Convierte un `ArmyBuildContext` en vivo en su equivalente JSON plano. */
export function toArmyBuildRequest(ctx: ArmyBuildContext): ArmyBuildRequestDTO {
  const unitCatalog: UnitCatalogEntryDTO[] = [];
  for (const type of ALL_UNIT_TYPES) {
    for (let rank = 1; rank <= 5; rank++) {
      const r = rank as Rank;
      unitCatalog.push({
        type,
        rank: r,
        cost: ctx.costOf(type, r),
        stats: ctx.statsOf(type, r),
      });
    }
  }
  return {
    budget: ctx.budget,
    selfArmyId: ctx.selfArmyId,
    armyCount: ctx.armyCount,
    fieldSize: ctx.fieldSize,
    unitCatalog,
  };
}
