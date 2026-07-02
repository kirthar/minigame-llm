import { HeuristicAgent, type Doctrine } from "./HeuristicAgent.ts";
import type { Agent, AgentFactory } from "./Agent.ts";

/**
 * Registro nombre → fábrica de agentes. Permite elegir la estrategia de cada
 * ejército por nombre y, en el futuro, añadir agentes remotos/LLM sin tocar el
 * resto del código.
 */
export const AGENT_REGISTRY: Record<string, AgentFactory> = {
  balanced: () => new HeuristicAgent("balanced"),
  cavalry: () => new HeuristicAgent("cavalry"),
  ranged: () => new HeuristicAgent("ranged"),
};

const ROTATION: Doctrine[] = ["balanced", "cavalry", "ranged"];

/** Crea un agente para el i-ésimo ejército, rotando entre las doctrinas. */
export function defaultAgentFor(index: number): Agent {
  return new HeuristicAgent(ROTATION[index % ROTATION.length]);
}

export { HeuristicAgent };
export type { Doctrine };
