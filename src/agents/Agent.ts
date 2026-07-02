import type {
  ArmyId,
  Rank,
  Stats,
  UnitId,
  UnitType,
  Vec2,
} from "../domain/types.ts";
import type { DiplomacyIntent } from "../domain/diplomacy.ts";
import type { OrderSet } from "../orders/orders.ts";
import type { Rng } from "../engine/rng.ts";

export type { DiplomacyIntent };

/**
 * Vista de solo lectura de una unidad tal y como la percibe un agente.
 * Es una copia: mutarla no afecta al estado real de la partida.
 */
export interface UnitView {
  readonly id: UnitId;
  readonly type: UnitType;
  readonly armyId: ArmyId;
  readonly rank: Rank;
  readonly pos: Vec2;
  readonly hp: number;
  readonly maxHp: number;
  readonly stats: Stats;
  readonly cost: number;
  /** Fracción de vida restante (hp/maxHp), ya calculada para el agente. */
  readonly hpFrac: number;
}

/**
 * Instantánea completa del campo de batalla entregada al agente cada turno.
 * Es un juego de información perfecta: el agente ve todas las unidades.
 */
export interface BattlefieldView {
  readonly turn: number;
  readonly maxTurns: number;
  readonly fieldSize: number;
  readonly selfArmyId: ArmyId;
  readonly units: readonly UnitView[];
  /** RNG semillado propio de este ejército (determinista con la semilla del motor). */
  readonly rng: Rng;
  /** Pares de ejércitos actualmente aliados. */
  readonly alliances: ReadonlyArray<readonly [ArmyId, ArmyId]>;
  /** Nº de traiciones cometidas por cada ejército hasta ahora (reputación pública). */
  readonly reputations: Readonly<Record<ArmyId, number>>;
  /** Unidades propias vivas. */
  own(): UnitView[];
  /** Unidades enemigas vivas. */
  enemies(): UnitView[];
  /** Suma de valor (coste × fracción de hp) de las unidades vivas de un ejército. */
  armyStrength(armyId: ArmyId): number;
  /** Nº de unidades vivas de un ejército. */
  unitCount(armyId: ArmyId): number;
  /** Unidad enemiga más cercana a una posición, o null si no hay ninguna. */
  nearestEnemyTo(pos: Vec2): UnitView | null;
  /** Unidad aliada (propia) más cercana a una posición, excluyendo opcionalmente una unidad. */
  nearestAllyTo(pos: Vec2, excludeId?: UnitId): UnitView | null;
}

/** Una entrada de la composición del ejército: un tipo de tropa a cierto rango. */
export interface BlueprintEntry {
  type: UnitType;
  rank: Rank;
}

export type ArmyBlueprint = BlueprintEntry[];

/** Contexto entregado al agente para formar su ejército en la preparación. */
export interface ArmyBuildContext {
  readonly budget: number;
  readonly selfArmyId: ArmyId;
  readonly armyCount: number;
  readonly fieldSize: number;
  /** RNG semillado propio de este ejército (determinista con la semilla del motor). */
  readonly rng: Rng;
  /** Coste de un tipo/rango concreto, para que el agente presupueste. */
  costOf(type: UnitType, rank: Rank): number;
  /** Stats de un tipo/rango concreto. */
  statsOf(type: UnitType, rank: Rank): Stats;
}

/**
 * Estrategia de un jugador. La v0.0.1 trae implementaciones "estáticas"
 * (heurísticas); más adelante un agente remoto/LLM implementará esta MISMA
 * interfaz sin que el motor ni el render cambien.
 */
export interface Agent {
  readonly name: string;
  /** Fase de preparación: elige tropas dentro del presupuesto. */
  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint;
  /** Análisis único del campo antes del primer turno (opcional). */
  onBattleStart?(view: BattlefieldView): void;
  /** Fase de batalla: emite las órdenes de este turno. */
  planTurn(view: BattlefieldView): OrderSet;
  /** Intenciones diplomáticas de este turno (proponer/romper alianzas). Opcional. */
  planDiplomacy?(view: BattlefieldView): DiplomacyIntent[];
}

/** Fábrica de agentes, para poder registrar y elegir estrategias por nombre. */
export type AgentFactory = () => Agent;
