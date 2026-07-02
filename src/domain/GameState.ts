import { Army, unitsOf } from "./Army.ts";
import type { Unit } from "./Unit.ts";
import { Phase, type ArmyId } from "./types.ts";

/** Estado completo de una partida. Mutado por el motor a cada turno. */
export class GameState {
  phase: Phase = Phase.Preparation;
  turn = 0;
  readonly armies: Army[] = [];
  readonly units: Unit[] = [];
  /** Ejército ganador una vez terminada la partida (null = empate). */
  winner: ArmyId | null = null;
  finished = false;

  /** Pares de ejércitos actualmente aliados (clave: `pairKey(a,b)`). */
  readonly alliances = new Set<string>();
  /** Nº de traiciones cometidas por cada ejército (atacar a un aliado). */
  readonly betrayalCounts: Record<ArmyId, number> = {};

  /** Ejércitos que todavía tienen al menos una unidad viva. */
  livingArmyIds(): ArmyId[] {
    return this.armies
      .map((a) => a.id)
      .filter((id) => unitsOf(this.units, id).length > 0);
  }

  armyById(id: ArmyId): Army | undefined {
    return this.armies.find((a) => a.id === id);
  }
}
