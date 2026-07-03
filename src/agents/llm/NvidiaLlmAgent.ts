import type { Agent, ArmyBlueprint, ArmyBuildContext, BattlefieldView } from "../Agent.ts";
import { OrderType, type OrderSet } from "../../orders/orders.ts";
import type { DiplomacyIntent } from "../../domain/diplomacy.ts";
import type { NvidiaModelDef } from "../../config/models.ts";
import type { LlmCompletionRequest } from "./LlmClient.ts";
import { NvidiaClient } from "./NvidiaClient.ts";
import { toArmyBuildRequest, toBattlefieldSnapshot } from "./dto.ts";
import { buildArmyPrompt, buildDiplomacyPrompt, buildTurnPrompt } from "./promptBuilder.ts";
import { parseArmyBlueprint, parseDiplomacyIntents, parseOrderSet } from "./responseParser.ts";

export interface LlmIO {
  label: string;
  req: LlmCompletionRequest;
  response: string;
}

/**
 * Agente respaldado por un modelo de NVIDIA (API OpenAI-compatible).
 *
 * Implementa la interfaz `Agent` síncrona del motor devolviendo resultados
 * cacheados. La `Simulation` llama a `prefetchArmy` / `prefetchTurn` de
 * forma asíncrona ANTES de que el motor invoque `buildArmy` / `planTurn`,
 * de modo que las llamadas síncronas del motor encuentran los resultados ya
 * listos. Si el prefetch no se ha completado (error de red, timeout), los
 * métodos síncronos usan un fallback seguro (round-robin rango 1 / Hold).
 *
 * El I/O de cada llamada queda accesible en `lastBuildArmyIO` /
 * `lastPlanTurnIO` para que `Simulation` pueda registrarlo en el EventLog.
 */
export class NvidiaLlmAgent implements Agent {
  readonly name: string;
  private readonly client: NvidiaClient;
  private cachedArmy: ArmyBlueprint | null = null;
  private cachedOrders: OrderSet | null = null;
  private cachedDiplomacy: DiplomacyIntent[] | null = null;

  lastBuildArmyIO: LlmIO | null = null;
  lastPlanTurnIO: LlmIO[] = [];

  constructor(model: NvidiaModelDef) {
    this.name = model.label;
    this.client = new NvidiaClient(model);
  }

  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    if (this.cachedArmy) return this.cachedArmy;
    return this.fallbackArmy(ctx);
  }

  planTurn(_view: BattlefieldView): OrderSet {
    const cached = this.cachedOrders;
    this.cachedOrders = null;
    return cached ?? { global: { kind: OrderType.Hold } };
  }

  planDiplomacy(_view: BattlefieldView): DiplomacyIntent[] {
    const cached = this.cachedDiplomacy;
    this.cachedDiplomacy = null;
    return cached ?? [];
  }

  async prefetchArmy(ctx: ArmyBuildContext): Promise<void> {
    this.lastBuildArmyIO = null;
    try {
      const req = buildArmyPrompt(toArmyBuildRequest(ctx));
      const response = await this.client.complete(req);
      this.lastBuildArmyIO = { label: "Construir ejército", req, response };
      this.cachedArmy = parseArmyBlueprint(response);
    } catch (err) {
      console.error(`[${this.name}] Error en buildArmy:`, err);
      this.cachedArmy = null;
    }
  }

  async prefetchTurn(view: BattlefieldView): Promise<void> {
    this.lastPlanTurnIO = [];
    try {
      const dto = toBattlefieldSnapshot(view);
      const turnReq = buildTurnPrompt(dto);
      const diplomacyReq = buildDiplomacyPrompt(dto);

      const [turnResponse, diplomacyResponse] = await Promise.all([
        this.client.complete(turnReq),
        this.client.complete(diplomacyReq),
      ]);

      this.lastPlanTurnIO = [
        { label: "Órdenes de turno", req: turnReq, response: turnResponse },
        { label: "Diplomacia", req: diplomacyReq, response: diplomacyResponse },
      ];

      this.cachedOrders = parseOrderSet(turnResponse);
      this.cachedDiplomacy = parseDiplomacyIntents(diplomacyResponse);
    } catch (err) {
      console.error(`[${this.name}] Error en planTurn:`, err);
      this.cachedOrders = null;
      this.cachedDiplomacy = null;
    }
  }

  private fallbackArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    const dto = toArmyBuildRequest(ctx);
    const rank1 = dto.unitCatalog.filter((e) => e.rank === 1);
    const units: Array<{ type: string; rank: number }> = [];
    let spent = 0;
    let i = 0;
    while (rank1.length > 0) {
      const entry = rank1[i % rank1.length];
      if (spent + entry.cost > dto.budget) break;
      units.push({ type: entry.type, rank: entry.rank });
      spent += entry.cost;
      i++;
    }
    return parseArmyBlueprint("```json\n" + JSON.stringify(units) + "\n```");
  }
}
