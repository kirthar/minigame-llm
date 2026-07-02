import type { GameEvent } from "../engine/events.ts";
import type { GameState } from "./GameState.ts";
import type { ArmyId } from "./types.ts";

/**
 * Propone una alianza con `withArmyId`. Solo se forma si ambos ejércitos se
 * proponen mutuamente en el MISMO turno (ver `resolveDiplomacy`); si solo uno
 * de los dos propone, no pasa nada esa vez, pero como `planDiplomacy` se
 * reevalúa cada turno, repetir la propuesta turno a turno es la forma normal
 * de "seguir abierto" a la alianza hasta que el otro también proponga.
 */
export interface ProposeAllianceIntent {
  kind: "propose";
  withArmyId: ArmyId;
}

/**
 * Rompe unilateralmente una alianza activa con `withArmyId` (sin penalización:
 * a diferencia de atacar a un aliado, esto no cuenta como traición ni afecta
 * a `reputations`). No tiene efecto si no había alianza activa con ese ejército.
 */
export interface BreakAllianceIntent {
  kind: "break";
  withArmyId: ArmyId;
}

/** Intención diplomática que un agente puede emitir en `planDiplomacy`. */
export type DiplomacyIntent = ProposeAllianceIntent | BreakAllianceIntent;

/** Clave canónica (no dirigida) para un par de ejércitos. */
export function pairKey(a: ArmyId, b: ArmyId): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function areAllied(state: GameState, a: ArmyId, b: ArmyId): boolean {
  return state.alliances.has(pairKey(a, b));
}

/**
 * Resuelve las intenciones diplomáticas de un turno: primero las roturas
 * explícitas ("break"), luego forma una alianza cuando dos ejércitos se
 * proponen mutuamente en el mismo turno. Función pura sobre `state.alliances`
 * (la muta) — testable de forma aislada.
 */
export function resolveDiplomacy(
  intentsByArmy: Map<ArmyId, DiplomacyIntent[]>,
  state: GameState,
): GameEvent[] {
  const events: GameEvent[] = [];

  for (const [armyId, intents] of intentsByArmy) {
    for (const intent of intents) {
      if (intent.kind !== "break") continue;
      const key = pairKey(armyId, intent.withArmyId);
      if (state.alliances.delete(key)) {
        events.push({ kind: "alliance-broken", a: armyId, b: intent.withArmyId });
      }
    }
  }

  const proposals = new Set<string>();
  for (const [armyId, intents] of intentsByArmy) {
    for (const intent of intents) {
      if (intent.kind === "propose") proposals.add(`${armyId}>${intent.withArmyId}`);
    }
  }

  const formedPairs = new Set<string>();
  for (const [armyId, intents] of intentsByArmy) {
    for (const intent of intents) {
      if (intent.kind !== "propose") continue;
      const key = pairKey(armyId, intent.withArmyId);
      if (state.alliances.has(key) || formedPairs.has(key)) continue;
      const reciprocal = proposals.has(`${intent.withArmyId}>${armyId}`);
      if (reciprocal) {
        state.alliances.add(key);
        formedPairs.add(key);
        events.push({
          kind: "alliance-formed",
          a: armyId,
          b: intent.withArmyId,
          turn: state.turn,
        });
      }
    }
  }

  return events;
}
