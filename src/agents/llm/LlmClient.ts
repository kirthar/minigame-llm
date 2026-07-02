/**
 * Contrato mínimo que cualquier proveedor de LLM (Anthropic, OpenAI, un
 * modelo local...) debe implementar para poder usarse desde `LlmAgent`.
 * Deliberadamente asíncrono (`Promise`) porque una llamada real es una
 * petición de red — ver la nota sobre `Agent` síncrono en
 * `docs/AGENT_CONTRACTS.md`.
 */

export interface LlmCompletionRequest {
  /** Instrucciones de sistema: reglas del juego + formato de contrato esperado. */
  systemPrompt: string;
  /** Petición concreta de este turno/fase, con el snapshot JSON del estado. */
  userPrompt: string;
}

export interface LlmClient {
  /** Devuelve el texto crudo de la respuesta del modelo (se parsea después). */
  complete(request: LlmCompletionRequest): Promise<string>;
}
