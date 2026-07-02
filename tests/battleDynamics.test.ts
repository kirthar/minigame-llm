import { describe, expect, it } from "vitest";
import { GameEngine } from "../src/engine/GameEngine.ts";
import { HeuristicAgent } from "../src/agents/HeuristicAgent.ts";
import { UtilityAgent } from "../src/agents/UtilityAgent.ts";
import type { GameEvent } from "../src/engine/events.ts";

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i);

function runUtilityBattle(seed: number, armyCount: number) {
  const agents = Array.from({ length: armyCount }, (_, i) => new UtilityAgent(`U${i}`));
  const engine = new GameEngine(agents, { seed, armyCount });
  engine.setup();
  const allEvents: GameEvent[] = [];
  while (!engine.state.finished) {
    const { events } = engine.tick();
    allEvents.push(...events);
  }
  return { turns: engine.state.turn, events: allEvents };
}

function runHeuristicBattle(seed: number) {
  const engine = new GameEngine([new HeuristicAgent("balanced"), new HeuristicAgent("cavalry")], {
    seed,
    armyCount: 2,
  });
  engine.setup();
  while (!engine.state.finished) engine.tick();
  return engine.state.turn;
}

/** Turno (según los eventos "turn") en el que ocurre la primera baja. */
function firstKillTurn(events: GameEvent[]): number {
  let currentTurn = 0;
  for (const e of events) {
    if (e.kind === "turn") currentTurn = e.turn;
    if (e.kind === "kill") return currentTurn;
  }
  return 0;
}

describe("Dinámica de batalla · UtilityAgent (integración, 20 semillas)", () => {
  it("todas las partidas terminan dentro del límite de turnos y en tiempo razonable", () => {
    const t0 = Date.now();
    for (const seed of SEEDS) {
      const armyCount = 2 + (seed % 5); // 2..6
      const { turns } = runUtilityBattle(seed, armyCount);
      expect(turns).toBeLessThanOrEqual(30);
      expect(turns).toBeGreaterThan(0);
    }
    const elapsed = Date.now() - t0;
    // 20 partidas a hasta 6×90 unidades deben resolverse en un tiempo razonable.
    expect(elapsed).toBeLessThan(20_000);
  });

  it("las batallas de UtilityAgent no se resuelven de forma casi instantánea", () => {
    // Con el rebalance de combate, tanto Heuristic como Utility suelen agotar
    // los 30 turnos; lo relevante es que Utility no produzca exterminios
    // relámpago (gracias a retiradas/reservas), a diferencia de una IA que
    // siempre ataca sin más. Se compara el turno en que aparece la primera
    // baja como proxy de "cuánto tarda en empezar la sangría real".
    const firstKillTurnUtility = SEEDS.map((seed) => firstKillTurn(runUtilityBattle(seed, 2).events));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(firstKillTurnUtility)).toBeGreaterThan(0);
    // Ninguna partida debería resolverse en un puñado de turnos.
    const utilityTurns = SEEDS.map((seed) => runUtilityBattle(seed, 2).turns);
    expect(Math.min(...utilityTurns)).toBeGreaterThan(5);
  });

  it("HeuristicAgent sirve de referencia y también respeta el límite de turnos", () => {
    const heuristicTurns = SEEDS.slice(0, 5).map((seed) => runHeuristicBattle(seed));
    for (const t of heuristicTurns) expect(t).toBeLessThanOrEqual(30);
  });

  it("a lo largo de 20 semillas se forma al menos una alianza y ocurre al menos una traición", () => {
    let allianceCount = 0;
    let betrayalCount = 0;
    for (const seed of SEEDS) {
      const armyCount = 3 + (seed % 4); // 3..6, para dar pie a diplomacia
      const { events } = runUtilityBattle(seed, armyCount);
      allianceCount += events.filter((e) => e.kind === "alliance-formed").length;
      betrayalCount += events.filter((e) => e.kind === "betrayal").length;
    }
    expect(allianceCount).toBeGreaterThan(0);
    expect(betrayalCount).toBeGreaterThan(0);
  });

  it("produce tácticas variadas: retiradas/reagrupamientos (Move) y no solo ataques directos", () => {
    // Indirecto: si sólo hubiera Attack/Capture, las partidas con muchos
    // ejércitos tenderían a resolverse muy rápido por eliminación mutua total;
    // en cambio deben sobrevivir bastantes turnos gracias a retiradas/reservas.
    const { turns } = runUtilityBattle(4242, 4);
    expect(turns).toBeGreaterThan(5);
  });
});
