import type { ArmyBuildRequestDTO, BattlefieldSnapshotDTO } from "./dto.ts";
import { SYSTEM_PROMPT } from "./systemPrompt.ts";
import type { LlmCompletionRequest } from "./LlmClient.ts";

export { SYSTEM_PROMPT };

/** Construye la petición de la fase de preparación: pide un ArmyBlueprint. */
export function buildArmyPrompt(ctx: ArmyBuildRequestDTO): LlmCompletionRequest {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [
      "## Fase de preparación",
      "",
      "Elige tu ejército dentro del presupuesto. Responde solo con el array ArmyBlueprint en un bloque ```json.",
      "",
      "```json",
      JSON.stringify(ctx, null, 2),
      "```",
    ].join("\n"),
  };
}

/** Construye la petición de órdenes de un turno de batalla: pide un OrderSet. */
export function buildTurnPrompt(snapshot: BattlefieldSnapshotDTO): LlmCompletionRequest {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [
      `## Turno ${snapshot.turn}/${snapshot.maxTurns}`,
      "",
      "Da las órdenes de tus unidades este turno. Responde solo con el objeto OrderSet en un bloque ```json.",
      "",
      "```json",
      JSON.stringify(snapshot, null, 2),
      "```",
    ].join("\n"),
  };
}

/** Construye la petición de diplomacia de un turno: pide un DiplomacyIntent[]. */
export function buildDiplomacyPrompt(snapshot: BattlefieldSnapshotDTO): LlmCompletionRequest {
  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [
      `## Diplomacia — turno ${snapshot.turn}/${snapshot.maxTurns}`,
      "",
      "¿Quieres proponer o romper alguna alianza este turno? Responde solo con el",
      "array DiplomacyIntent[] en un bloque ```json (usa un array vacío [] si no).",
      "",
      "```json",
      JSON.stringify(snapshot, null, 2),
      "```",
    ].join("\n"),
  };
}
