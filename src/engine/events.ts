import type { ArmyId, Rank, UnitId } from "../domain/types.ts";

/** Eventos que el motor emite en cada turno, para el registro y el render. */
export type GameEvent =
  | { kind: "turn"; turn: number }
  | { kind: "attack"; attackerId: UnitId; targetId: UnitId; damage: number }
  | { kind: "kill"; killerId: UnitId | null; victimId: UnitId }
  | {
      kind: "capture";
      captorId: UnitId;
      victimId: UnitId;
      success: boolean;
      probability: number;
    }
  | { kind: "rankup"; unitId: UnitId; newRank: Rank }
  | { kind: "alliance-formed"; a: ArmyId; b: ArmyId; turn: number }
  | { kind: "alliance-broken"; a: ArmyId; b: ArmyId }
  | {
      kind: "betrayal";
      betrayerArmyId: ArmyId;
      victimArmyId: ArmyId;
      unitId: UnitId;
      targetId: UnitId;
    }
  | { kind: "finished"; winner: ArmyId | null; turn: number };
