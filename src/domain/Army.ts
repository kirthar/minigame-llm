import type { Unit } from "./Unit.ts";
import type { ArmyId } from "./types.ts";

/** Un ejército: identidad de un jugador y sus unidades vivas. */
export class Army {
  readonly id: ArmyId;
  readonly name: string;
  /** Color con el que se pintan sus unidades en el canvas. */
  readonly color: string;

  constructor(id: ArmyId, name: string, color: string) {
    this.id = id;
    this.name = name;
    this.color = color;
  }
}

/** Unidades vivas que pertenecen actualmente a un ejército. */
export function unitsOf(units: readonly Unit[], armyId: ArmyId): Unit[] {
  return units.filter((u) => u.alive && u.armyId === armyId);
}

/** Valor total de un ejército (para el desempate por puntuación). */
export function armyValue(units: readonly Unit[], armyId: ArmyId): number {
  return unitsOf(units, armyId).reduce((sum, u) => sum + u.value(), 0);
}
