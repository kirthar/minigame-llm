import type { ArmyId, Rank, UnitId } from "../domain/types.ts";

/** Se emite una vez al principio de cada `tick()`, antes de cualquier otro evento del turno. */
export interface TurnEvent {
  kind: "turn";
  turn: number;
}

/** Un ataque (fuera de captura) infligió `damage` puntos de daño. No implica que la víctima muriera. */
export interface AttackEvent {
  kind: "attack";
  attackerId: UnitId;
  targetId: UnitId;
  damage: number;
}

/**
 * Una unidad murió (hp llegó a 0) durante la fase de resolución. `killerId` es
 * la unidad que más daño individual aportó a esta muerte concreta (no
 * necesariamente el daño acumulado de toda la partida), o `null` si no se pudo
 * atribuir a ningún atacante.
 */
export interface KillEvent {
  kind: "kill";
  killerId: UnitId | null;
  victimId: UnitId;
}

/**
 * Un intento de captura se resolvió. `probability` es la probabilidad de éxito
 * calculada (ver `captureProbability` en `docs/GAME_RULES.md`); `success`
 * indica si la tirada tuvo éxito. La captura no inflige daño.
 */
export interface CaptureEvent {
  kind: "capture";
  captorId: UnitId;
  victimId: UnitId;
  success: boolean;
  probability: number;
}

/** Una unidad acumuló suficiente XP para subir de rango; `newRank` es el rango resultante. */
export interface RankUpEvent {
  kind: "rankup";
  unitId: UnitId;
  newRank: Rank;
}

/** Dos ejércitos formaron una alianza (ambos se propusieron mutuamente en el mismo turno). */
export interface AllianceFormedEvent {
  kind: "alliance-formed";
  a: ArmyId;
  b: ArmyId;
  turn: number;
}

/** Un ejército rompió explícitamente una alianza (intención `break`), sin que mediara traición. */
export interface AllianceBrokenEvent {
  kind: "alliance-broken";
  a: ArmyId;
  b: ArmyId;
}

/**
 * `betrayerArmyId` atacó o intentó capturar a una unidad de `victimArmyId`
 * mientras ambos ejércitos estaban aliados. El motor no bloquea el ataque: lo
 * deja proceder, rompe la alianza y emite este evento (además del `attack`/
 * `capture` correspondiente).
 */
export interface BetrayalEvent {
  kind: "betrayal";
  betrayerArmyId: ArmyId;
  victimArmyId: ArmyId;
  unitId: UnitId;
  targetId: UnitId;
}

/**
 * La partida terminó (por eliminación o por límite de turnos). `winner` es
 * `null` si hubo empate (aniquilación mutua el mismo turno, o empate de valor
 * al llegar al límite de turnos).
 */
export interface FinishedEvent {
  kind: "finished";
  winner: ArmyId | null;
  turn: number;
}

/** Unión discriminada por `kind` de todos los eventos que el motor puede emitir en un turno. */
export type GameEvent =
  | TurnEvent
  | AttackEvent
  | KillEvent
  | CaptureEvent
  | RankUpEvent
  | AllianceFormedEvent
  | AllianceBrokenEvent
  | BetrayalEvent
  | FinishedEvent;
