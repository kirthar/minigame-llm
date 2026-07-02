import type { GameEvent } from "../engine/events.ts";
import type { GameState } from "./GameState.ts";
import type { ArmyId } from "./types.ts";

/** Intención diplomática que un agente puede emitir en `planDiplomacy`. */
export type DiplomacyIntent =
  | { kind: "propose"; withArmyId: ArmyId }
  | { kind: "break"; withArmyId: ArmyId };

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
