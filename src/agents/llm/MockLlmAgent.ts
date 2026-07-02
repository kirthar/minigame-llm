import type { Agent, ArmyBlueprint, ArmyBuildContext, BattlefieldView } from "../Agent.ts";
import { OrderType, type OrderSet } from "../../orders/orders.ts";
import type { DiplomacyIntent } from "../../domain/diplomacy.ts";
import {
  toArmyBuildRequest,
  toBattlefieldSnapshot,
  type ArmyBuildRequestDTO,
} from "./dto.ts";
import { buildArmyPrompt, buildDiplomacyPrompt, buildTurnPrompt } from "./promptBuilder.ts";
import { parseArmyBlueprint, parseDiplomacyIntents, parseOrderSet } from "./responseParser.ts";
import type { LlmCompletionRequest } from "./LlmClient.ts";

/**
 * Agente que implementa `Agent` de verdad (síncrono, jugable hoy) pero pasa
 * por exactamente la misma tubería que usaría un LLM real: construye el DTO
 * JSON del estado, arma el prompt (`systemPrompt`+`userPrompt`, guardado en
 * `lastPrompt` para inspección), simula una "respuesta de modelo" con una
 * heurística mínima en vez de una llamada de red, y esa respuesta pasa por
 * el MISMO parseador tolerante que usaría una respuesta real. Sirve para
 * probar el contrato de extremo a extremo (DTO → prompt → parseo → Order/
 * ArmyBlueprint/DiplomacyIntent válidos) sin depender de ninguna API.
 */
export class MockLlmAgent implements Agent {
  readonly name: string;
  /** Última petición construida (system+user prompt), para inspección/tests. */
  lastPrompt: LlmCompletionRequest | null = null;

  constructor(name = "LLM (mock)") {
    this.name = name;
  }

  buildArmy(ctx: ArmyBuildContext): ArmyBlueprint {
    const dto = toArmyBuildRequest(ctx);
    this.lastPrompt = buildArmyPrompt(dto);
    return parseArmyBlueprint(mockArmyResponse(dto));
  }

  planTurn(view: BattlefieldView): OrderSet {
    const dto = toBattlefieldSnapshot(view);
    this.lastPrompt = buildTurnPrompt(dto);
    return parseOrderSet(mockTurnResponse());
  }

  planDiplomacy(view: BattlefieldView): DiplomacyIntent[] {
    const dto = toBattlefieldSnapshot(view);
    this.lastPrompt = buildDiplomacyPrompt(dto);
    return parseDiplomacyIntents(mockDiplomacyResponse());
  }
}

/**
 * "Respuesta de modelo" simulada para la fase de preparación: compra tropas
 * de rango 1 en round-robin hasta agotar el presupuesto. Sirve solo para
 * ejercitar el parseo — no pretende ser una composición táctica interesante
 * (esa es responsabilidad de un LLM real o de `UtilityAgent`).
 */
function mockArmyResponse(dto: ArmyBuildRequestDTO): string {
  const rank1 = dto.unitCatalog.filter((e) => e.rank === 1);
  const blueprint: Array<{ type: string; rank: number }> = [];
  let spent = 0;
  let i = 0;
  while (rank1.length > 0) {
    const entry = rank1[i % rank1.length];
    if (spent + entry.cost > dto.budget) break;
    blueprint.push({ type: entry.type, rank: entry.rank });
    spent += entry.cost;
    i++;
  }
  return "```json\n" + JSON.stringify(blueprint) + "\n```";
}

/** "Respuesta de modelo" simulada para un turno: todo el ejército ataca al enemigo más cercano en rango. */
function mockTurnResponse(): string {
  const orderSet: OrderSet = { global: { kind: OrderType.Attack } };
  return "```json\n" + JSON.stringify(orderSet) + "\n```";
}

/** "Respuesta de modelo" simulada para diplomacia: sin intenciones este turno. */
function mockDiplomacyResponse(): string {
  return "```json\n[]\n```";
}
