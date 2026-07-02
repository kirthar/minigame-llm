import { describe, expect, it } from "vitest";
import { GameEngine } from "../src/engine/GameEngine.ts";
import { MockLlmAgent } from "../src/agents/llm/MockLlmAgent.ts";

describe("MockLlmAgent", () => {
  it("forma un ejército y juega una partida completa sin errores", () => {
    const agents = [new MockLlmAgent("A"), new MockLlmAgent("B")];
    const engine = new GameEngine(agents, { seed: 5 });
    engine.setup();
    expect(engine.state.units.length).toBeGreaterThan(0);

    let guard = 0;
    while (!engine.state.finished && guard++ < 40) engine.tick();
    expect(engine.state.finished).toBe(true);
    expect(engine.state.turn).toBeLessThanOrEqual(30);
  });

  it("expone el último prompt construido (system + JSON de usuario)", () => {
    const agent = new MockLlmAgent();
    const engine = new GameEngine([agent, new MockLlmAgent()], { seed: 6 });
    engine.setup();

    expect(agent.lastPrompt).not.toBeNull();
    expect(agent.lastPrompt?.systemPrompt).toContain("Batallas de ejércitos");
    expect(agent.lastPrompt?.userPrompt).toContain("Fase de preparación");

    engine.tick();
    expect(agent.lastPrompt?.userPrompt).toContain("Turno");
    expect(() => JSON.parse(agent.lastPrompt!.userPrompt.match(/```json\n([\s\S]*?)\n```/)![1])).not.toThrow();
  });
});
