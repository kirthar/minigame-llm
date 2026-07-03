import { UtilityAgent } from "../agents/UtilityAgent.ts";
import { NvidiaLlmAgent } from "../agents/llm/NvidiaLlmAgent.ts";
import { GAME_CONFIG } from "../config/game.ts";
import { NVIDIA_MODELS } from "../config/models.ts";
import { UNIT_DEFS } from "../config/units.ts";
import { GameEngine } from "../engine/GameEngine.ts";
import type { TurnResult } from "../engine/GameEngine.ts";
import { Phase, UnitType } from "../domain/types.ts";
import type { Agent, ArmyBuildContext } from "../agents/Agent.ts";
import type { UnitId } from "../domain/types.ts";
import { ARMY_COLOR_CACHE, CanvasRenderer } from "../render/CanvasRenderer.ts";
import { ARMY_COLORS } from "../render/palette.ts";
import { Controls } from "../ui/Controls.ts";
import { EventLog } from "../ui/EventLog.ts";
import { AgentSelector } from "../ui/AgentSelector.ts";

const BASE_TURN_MS = 700;

/** Une motor, render, controles y log; gestiona el bucle de animación. */
export class Simulation {
  private engine!: GameEngine;
  private renderer: CanvasRenderer;
  private controls: Controls;
  private agentSelector: AgentSelector;
  private log!: EventLog;
  private currentAgents: Agent[] = [];

  private playing = false;
  private speed = 1;
  private maxTurns: number = GAME_CONFIG.maxTurns;
  private budget: number = GAME_CONFIG.budget;
  private active: { result: TurnResult; elapsed: number } | null = null;
  private lastTs = 0;
  private hoveredUnitId: UnitId | null = null;
  private stepping = false;
  private loading = false;
  private thinking = false;
  private readonly tooltip: HTMLDivElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    controlsEl: HTMLElement,
    private readonly logEl: HTMLElement,
    private readonly statusEl: HTMLElement,
    private readonly armySummaryEl: HTMLElement,
    agentSelectorEl: HTMLElement,
  ) {
    this.renderer = new CanvasRenderer(canvas, GAME_CONFIG.fieldSize);
    this.controls = new Controls(controlsEl, {
      onPlayPause: (p) => (this.playing = p),
      onStep: () => { void this.step(); },
      onRestart: (n) => this.restart(n),
      onSpeed: (m) => (this.speed = m),
      onMaxTurns: (n) => { this.maxTurns = n; },
      onBudget: (n) => { this.budget = n; },
    });

    this.agentSelector = new AgentSelector(agentSelectorEl, (_i, _key) => {
      // No auto-restart on agent change; selection is applied on next restart.
    });

    this.tooltip = document.createElement("div");
    this.tooltip.id = "unit-tooltip";
    document.body.appendChild(this.tooltip);

    canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    canvas.addEventListener("mouseleave", () => {
      this.hoveredUnitId = null;
      this.tooltip.style.display = "none";
    });

    this.restart(GAME_CONFIG.defaultArmies);
    requestAnimationFrame((ts) => this.frame(ts));
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.engine) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssToCanvas = this.canvas.width / rect.width;
    const canvasX = (e.clientX - rect.left) * cssToCanvas;
    const canvasY = (e.clientY - rect.top) * cssToCanvas;
    const worldX = canvasX / this.renderer.scale;
    const worldY = canvasY / this.renderer.scale;

    const hitRadiusPx = 15;
    let best: { id: UnitId; dist: number } | null = null;
    for (const u of this.engine.state.units) {
      if (!u.alive) continue;
      const dx = (u.pos.x - worldX) * this.renderer.scale;
      const dy = (u.pos.y - worldY) * this.renderer.scale;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= hitRadiusPx && (!best || dist < best.dist)) {
        best = { id: u.id, dist };
      }
    }

    if (best) {
      this.hoveredUnitId = best.id;
      const u = this.engine.state.units.find((x) => x.id === best!.id)!;
      const stats = u.stats();
      const army = this.engine.state.armyById(u.armyId);
      const armyName = army ? `E${army.id} · ${army.name}` : `E${u.armyId}`;
      this.tooltip.textContent = [
        `${UNIT_DEFS[u.type].label} — ${armyName}`,
        `Rango: ${u.rank}`,
        `HP: ${u.hp} / ${stats.maxHp}`,
        `Ataque: ${stats.attack}`,
        `Alcance: ${stats.range}`,
        `Armadura: ${stats.armor}`,
      ].join("\n");
      this.tooltip.style.display = "block";
      this.tooltip.style.left = `${e.clientX + 14}px`;
      this.tooltip.style.top = `${e.clientY - 8}px`;
    } else {
      this.hoveredUnitId = null;
      this.tooltip.style.display = "none";
    }
  }

  /** Lanza el reinicio (asíncrono si hay agentes LLM). */
  private restart(armyCount: number): void {
    this.playing = false;
    this.controls.setPlaying(false);
    this.active = null;
    this.tooltip.style.display = "none";
    void this.doRestart(armyCount);
  }

  private async doRestart(armyCount: number): Promise<void> {
    this.loading = true;
    this.updateStatus();

    const agents: Agent[] = Array.from({ length: armyCount }, (_, i) =>
      this.createAgentForKey(this.agentSelector.getKey(i), i),
    );
    this.currentAgents = agents;

    const newEngine = new GameEngine(agents, {
      armyCount,
      maxTurns: this.maxTurns,
      budget: this.budget,
    });

    // Prefetch armies for LLM agents before engine.setup() calls buildArmy()
    const prefetches = agents.map((a, i) =>
      a instanceof NvidiaLlmAgent
        ? a.prefetchArmy(newEngine.createBuildContextFor(i) as ArmyBuildContext)
        : Promise.resolve(),
    );
    await Promise.all(prefetches);

    newEngine.setup();
    this.engine = newEngine;

    ARMY_COLOR_CACHE.clear();
    for (const army of this.engine.state.armies) {
      ARMY_COLOR_CACHE.set(army.id, army.color);
    }

    const colors = Array.from({ length: armyCount }, (_, i) => ARMY_COLORS[i % ARMY_COLORS.length]);
    this.agentSelector.update(armyCount, colors);

    this.log = new EventLog(this.logEl, (id) => this.labelFor(id));
    this.log.clear();
    this.log.line("Fase de preparación completada. ¡A la batalla!", "turn-sep");
    for (const army of this.engine.state.armies) {
      const count = this.engine.state.units.filter((u) => u.armyId === army.id).length;
      this.log.line(`Ejército ${army.id} · ${army.name}: ${count} unidades`);
    }

    this.loading = false;
    this.renderer.draw(this.engine.state);
    this.updateStatus();
    this.updateArmySummary();
  }

  /** Ejecuta un turno: prefetch LLM → tick → animar. */
  private async step(): Promise<void> {
    if (!this.engine || this.active || this.engine.state.finished || this.stepping || this.loading) return;
    this.stepping = true;
    try {
      const llmAgents = this.currentAgents
        .map((a, i) => (a instanceof NvidiaLlmAgent ? { agent: a, i } : null))
        .filter((x): x is { agent: NvidiaLlmAgent; i: number } => x !== null);

      if (llmAgents.length) {
        this.thinking = true;
        this.updateStatus();
        await Promise.all(
          llmAgents.map(({ agent, i }) => agent.prefetchTurn(this.engine.createViewFor(i))),
        );
        this.thinking = false;
      }

      const result = this.engine.tick();
      this.log.push(result.events);
      this.active = { result, elapsed: 0 };
      this.updateStatus();
      this.updateArmySummary();
    } finally {
      this.stepping = false;
      this.thinking = false;
    }
  }

  private frame(ts: number): void {
    const dt = this.lastTs ? ts - this.lastTs : 0;
    this.lastTs = ts;

    if (this.engine && !this.active && this.playing && !this.engine.state.finished && !this.stepping && !this.loading) {
      void this.step();
    }

    if (this.engine && this.active) {
      const duration = BASE_TURN_MS / this.speed;
      this.active.elapsed += dt;
      const t = Math.min(1, this.active.elapsed / duration);
      this.renderer.draw(this.engine.state, {
        startPositions: this.active.result.startPositions,
        unitActions: this.active.result.unitActions,
        t,
        ts,
        hoveredUnitId: this.hoveredUnitId,
      });
      if (t >= 1) this.active = null;
    } else if (this.engine) {
      this.renderer.draw(this.engine.state, { ts, hoveredUnitId: this.hoveredUnitId });
    }

    if (this.engine && this.engine.state.finished && this.playing) {
      this.playing = false;
      this.controls.setPlaying(false);
      this.updateStatus();
    }

    requestAnimationFrame((next) => this.frame(next));
  }

  private updateStatus(): void {
    if (this.loading) {
      this.statusEl.textContent = "⏳ Preparando ejércitos…";
      return;
    }
    if (this.thinking) {
      this.statusEl.textContent = "⏳ LLMs pensando…";
      return;
    }
    if (!this.engine) return;
    const s = this.engine.state;
    if (s.phase === Phase.Finished) {
      this.statusEl.textContent =
        s.winner === null
          ? `Fin · Empate (turno ${s.turn})`
          : `Fin · Gana ${s.armyById(s.winner)?.name ?? s.winner} (turno ${s.turn})`;
    } else {
      const alive = s.livingArmyIds().length;
      this.statusEl.textContent = `Turno ${s.turn}/${this.maxTurns} · ${alive} ejércitos en pie`;
    }
  }

  private updateArmySummary(): void {
    if (!this.engine) return;
    const s = this.engine.state;
    const typeOrder = [UnitType.Light, UnitType.Heavy, UnitType.Archer, UnitType.Cavalry];
    this.armySummaryEl.innerHTML = "";

    for (const army of s.armies) {
      const aliveUnits = s.units.filter((u) => u.armyId === army.id && u.alive);
      const totalUnits = s.units.filter((u) => u.armyId === army.id);
      const color = ARMY_COLOR_CACHE.get(army.id) ?? "#888";

      const row = document.createElement("div");
      row.className = "army-row" + (aliveUnits.length === 0 ? " army-row--eliminated" : "");

      const header = document.createElement("div");
      header.className = "army-row-header";

      const dot = document.createElement("span");
      dot.className = "army-dot";
      dot.style.background = color;

      const nameSpan = document.createElement("span");
      nameSpan.className = "army-name";
      nameSpan.textContent = `E${army.id} · ${army.name}`;

      const countSpan = document.createElement("span");
      countSpan.className = "army-count";
      countSpan.textContent = `${aliveUnits.length}/${totalUnits.length}`;

      header.append(dot, nameSpan, countSpan);
      row.appendChild(header);

      if (aliveUnits.length > 0) {
        const breakdown = document.createElement("div");
        breakdown.className = "army-breakdown";
        const parts: string[] = [];
        for (const type of typeOrder) {
          const n = aliveUnits.filter((u) => u.type === type).length;
          if (n > 0) parts.push(`${UNIT_DEFS[type].label}: ${n}`);
        }
        breakdown.textContent = parts.join(" · ");
        row.appendChild(breakdown);
      }

      this.armySummaryEl.appendChild(row);
    }
  }

  private createAgentForKey(key: string, index: number): Agent {
    const model = NVIDIA_MODELS.find((m) => m.id === key);
    if (model) return new NvidiaLlmAgent(model);
    return new UtilityAgent(`Utilidad ${index}`);
  }

  private labelFor(unitId: string): string {
    if (!this.engine) return unitId;
    const u = this.engine.state.units.find((x) => x.id === unitId);
    if (!u) return unitId;
    return `E${u.armyId}·${UNIT_DEFS[u.type].label} r${u.rank}`;
  }
}
