import type { LlmClient, LlmCompletionRequest } from "./LlmClient.ts";
import type { NvidiaModelDef } from "../../config/models.ts";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export class NvidiaClient implements LlmClient {
  constructor(private readonly model: NvidiaModelDef) {}

  async complete(req: LlmCompletionRequest): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model.id,
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userPrompt },
      ],
      temperature: this.model.temperature,
      top_p: 0.95,
      [this.model.maxTokensParam ?? "max_tokens"]: this.model.maxTokens,
      stream: false,
      ...this.model.extraBody,
    };

    const res = await fetch(NVIDIA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.model.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`NVIDIA API ${res.status}: ${text}`);
    }

    const json = await res.json();
    return json.choices[0].message.content as string;
  }
}
