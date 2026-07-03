export interface NvidiaModelDef {
  id: string;
  label: string;
  apiKey: string;
  maxTokens: number;
  temperature: number;
  /** Campos extra para el cuerpo de la petición (p.ej. deepseek necesita chat_template_kwargs). */
  extraBody?: Record<string, unknown>;
  /** kimi-k2.6 usa "max_completion_tokens" en vez de "max_tokens". */
  maxTokensParam?: "max_tokens" | "max_completion_tokens";
}

/**
 * Modelos de NVIDIA disponibles. Las API keys se leen de variables de entorno
 * (prefijo VITE_ para que Vite las exponga al bundle) definidas en `.env.local`
 * (gitignoreado). Si una key está vacía el modelo aparece en la UI pero las
 * llamadas fallarán con 401 — el agente usará el fallback (Hold).
 */
export const NVIDIA_MODELS: NvidiaModelDef[] = [
  {
    id: "z-ai/glm-5.2",
    label: "GLM 5.2",
    apiKey: import.meta.env.VITE_NVIDIA_KEY_GLM ?? "",
    maxTokens: 16384,
    temperature: 1,
  },
  {
    id: "moonshotai/kimi-k2.6",
    label: "Kimi K2.6",
    apiKey: import.meta.env.VITE_NVIDIA_KEY_KIMI ?? "",
    maxTokens: 16384,
    temperature: 1,
    maxTokensParam: "max_completion_tokens",
  },
  {
    id: "minimaxai/minimax-m2.7",
    label: "MiniMax M2.7",
    apiKey: import.meta.env.VITE_NVIDIA_KEY_MINIMAX ?? "",
    maxTokens: 8192,
    temperature: 1,
  },
  {
    id: "deepseek-ai/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    apiKey: import.meta.env.VITE_NVIDIA_KEY_DEEPSEEK ?? "",
    maxTokens: 16384,
    temperature: 1,
    extraBody: { chat_template_kwargs: { thinking: false } },
  },
];
