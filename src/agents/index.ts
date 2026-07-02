import { HeuristicAgent, type Doctrine } from "./HeuristicAgent.ts";
import { UtilityAgent } from "./UtilityAgent.ts";
import type { Agent, AgentFactory } from "./Agent.ts";

/**
 * Registro nombre → fábrica de agentes. Permite elegir la estrategia de cada
 * ejército por nombre y, en el futuro, añadir agentes remotos/LLM sin tocar el
 * resto del código.
 */
export const AGENT_REGISTRY: Record<string, AgentFactory> = {
  utility: () => new UtilityAgent(),
  balanced: () => new HeuristicAgent("balanced"),
  cavalry: () => new HeuristicAgent("cavalry"),
  ranged: () => new HeuristicAgent("ranged"),
};

/**
 * Crea el agente por defecto para el i-ésimo ejército. Todos son `UtilityAgent`:
 * su perfil de estrategia se deriva de su propia composición y de un RNG
 * semillado por ejército, así que dos instancias ya se comportan de forma
 * distinta sin necesitar una doctrina con nombre.
 */
export function defaultAgentFor(index: number): Agent {
  return new UtilityAgent(`Utilidad ${index}`);
}

export { HeuristicAgent, UtilityAgent };
export type { Doctrine };
