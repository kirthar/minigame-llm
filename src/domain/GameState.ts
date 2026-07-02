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
