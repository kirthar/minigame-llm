import { UNIT_DEFS } from "../config/units.ts";
import {
  costMultiplier,
  statMultiplier,
  xpThresholdFor,
} from "../config/ranks.ts";
import {
  MAX_RANK,
  type ArmyId,
  type Rank,
  type Stats,
  type UnitId,
  type UnitType,
  type UnitTypeDef,
  type Vec2,
} from "./types.ts";

/**
 * Una unidad concreta en el campo. Guarda estado mutable (posición, hp, xp,
 * rango, dueño) y deriva sus stats efectivas a partir del tipo y el rango.
 */
export class Unit {
  readonly id: UnitId;
  readonly type: UnitType;
  /** Ejército que la controla actualmente (cambia al ser capturada). */
  armyId: ArmyId;
  rank: Rank;
  pos: Vec2;
  hp: number;
  xp: number;
  /** Distancia recorrida en la fase de movimiento del turno actual. */
  distanceMovedThisTurn = 0;

  constructor(params: {
    id: UnitId;
    type: UnitType;
    armyId: ArmyId;
    rank: Rank;
    pos: Vec2;
    hp?: number;
  }) {
    this.id = params.id;
    this.type = params.type;
    this.armyId = params.armyId;
    this.rank = params.rank;
    this.pos = { ...params.pos };
    this.xp = 0;
    this.hp = params.hp ?? 0;
    if (params.hp === undefined) this.hp = this.stats().maxHp;
  }

  get def(): UnitTypeDef {
    return UNIT_DEFS[this.type];
  }

  /** Stats efectivas escaladas por el rango actual (redondeadas). */
  stats(): Stats {
    const m = statMultiplier(this.rank);
    const b = this.def.baseStats;
    return {
      maxHp: Math.round(b.maxHp * m),
      attack: Math.round(b.attack * m),
      // Rango y movimiento escalan de forma más suave para no romper el equilibrio.
      range: b.range,
      move: b.move,
      armor: b.armor,
    };
  }

  /** Coste en puntos de esta unidad a su rango actual. */
  cost(): number {
    return Math.ceil(this.def.baseCost * costMultiplier(this.rank));
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Valor de la unidad para el desempate por puntuación (coste × fracción de hp). */
  value(): number {
    return this.cost() * (this.hp / this.stats().maxHp);
  }

  /**
   * Suma XP y sube de rango tantas veces como los umbrales lo permitan.
   * Devuelve el número de rangos ganados (para el log).
   */
  gainXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.rank < MAX_RANK && this.xp >= xpThresholdFor((this.rank + 1) as Rank)) {
      const beforeMax = this.stats().maxHp;
      this.rank = (this.rank + 1) as Rank;
      // Al subir de rango cura la diferencia de vida máxima ganada.
      const afterMax = this.stats().maxHp;
      this.hp += afterMax - beforeMax;
      gained++;
    }
    return gained;
  }
}
