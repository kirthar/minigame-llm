import type { ArmyBlueprint, ArmyBuildContext, BattlefieldView } from "../Agent.ts";
import type { OrderSet } from "../../orders/orders.ts";
import type { DiplomacyIntent } from "../../domain/diplomacy.ts";
import { toArmyBuildRequest, toBattlefieldSnapshot } from "./dto.ts";
import { buildArmyPrompt, buildDiplomacyPrompt, buildTurnPrompt } from "./promptBuilder.ts";
import { parseArmyBlueprint, parseDiplomacyIntents, parseOrderSet } from "./responseParser.ts";
import type { LlmClient } from "./LlmClient.ts";

/**
 * Implementación de referencia de un agente respaldado por un LLM real.
 *
 * **No implementa `Agent`**: sus métodos son asíncronos (una llamada a un
 * LLM es una petición de red), mientras que `GameEngine` invoca a los
 * agentes de forma síncrona dentro de `setup()`/`tick()`. Conectar esta
 * clase de verdad requeriría hacer asíncronos `Agent.buildArmy`/`planTurn`/
 * `planDiplomacy` y `GameEngine.setup()`/`tick()` — un cambio de motor
 * deliberadamente fuera de alcance aquí (ver "Fuera de alcance" en
 * `docs/AGENT_PROMPT.md`). Esta clase es el punto de partida para esa
 * migración futura: usa la misma tubería DTO → prompt → parseo que
 * `MockLlmAgent`, solo que con una llamada real a `LlmClient.complete()` en
 * vez de una respuesta simulada. `MockLlmAgent` sí es un `Agent` válido y
 * jugable hoy mismo.
 */
export class LlmAgent {
  constructor(
    readonly name: string,
    private readonly client: LlmClient,
  ) {}

  async buildArmyAsync(ctx: ArmyBuildContext): Promise<ArmyBlueprint> {
    const request = buildArmyPrompt(toArmyBuildRequest(ctx));
    const raw = await this.client.complete(request);
    return parseArmyBlueprint(raw);
  }

  async planTurnAsync(view: BattlefieldView): Promise<OrderSet> {
    const request = buildTurnPrompt(toBattlefieldSnapshot(view));
    const raw = await this.client.complete(request);
    return parseOrderSet(raw);
  }

  async planDiplomacyAsync(view: BattlefieldView): Promise<DiplomacyIntent[]> {
    const request = buildDiplomacyPrompt(toBattlefieldSnapshot(view));
    const raw = await this.client.complete(request);
    return parseDiplomacyIntents(raw);
  }
}
