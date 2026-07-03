import type { Agent, ArmyBlueprint, ArmyBuildContext, BattlefieldView } from "../Agent.ts";
import { OrderType, type OrderSet } from "../../orders/orders.ts";
import type { DiplomacyIntent } from "../../domain/diplomacy.ts";
import type { NvidiaModelDef } from "../../config/models.ts";
import { NvidiaClient } from "./NvidiaClient.ts";
import { LlmAgent } from "./LlmAgent.ts";
import { toArmyBuildRequest } from "./dto.ts";
import { parseArmyBlueprint } from "./responseParser.ts";

/**
 * Agente respaldado por un modelo de NVIDIA (API OpenAI-compatible).
 *
 * Implementa la interfaz `Agent` síncrona del motor devolviendo resultados
 * cacheados. La `Simulation` llama a `prefetchArmy` / `prefetchTurn` de
 * forma asíncrona ANTES de que el motor invoque `buildArmy` / `planTurn`,
 * de modo que las llamadas síncronas del motor encuentran los resultados ya
 * listos. Si el prefetch no se ha completado (error de red, timeout), los
 * métodos síncronos usan un fallback seguro (round-robin rango 1 / Hold).
 */
export class NvidiaLlmAgent implements Agent {
  readonly name: string;
  private readonly inner: LlmAgent;
  private cachedArmy: ArmyBlueprint | null = null;
  private cachedOrders: OrderSet | null = null;
  private cachedDiplomacy: DiplomacyIntent[] | null = null;

  constructor(model: NvidiaModelDef) {
    this.name = model.label;
    this.inner = new LlmAgent(model.label, new NvidiaClient(model));
  }

  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    if (this.cachedArmy) return this.cachedArmy;
    // Fallback: round-robin de tropas rango 1 (solo si el prefetch falló)
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

  /** Llama al LLM para construir el ejército y cachea el resultado. */
  async prefetchArmy(ctx: ArmyBuildContext): Promise<void> {
    try {
      this.cachedArmy = await this.inner.buildArmyAsync(ctx);
    } catch (err) {
      console.error(`[${this.name}] Error en buildArmy:`, err);
      this.cachedArmy = null;
    }
  }

  /** Llama al LLM para planificar el turno y diplomacia, y cachea ambos resultados. */
  async prefetchTurn(view: BattlefieldView): Promise<void> {
    try {
      [this.cachedOrders, this.cachedDiplomacy] = await Promise.all([
        this.inner.planTurnAsync(view),
        this.inner.planDiplomacyAsync(view),
      ]);
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
