import { defaultAgentFor } from "../agents/index.ts";
import { GAME_CONFIG } from "../config/game.ts";
import { UNIT_DEFS } from "../config/units.ts";
import { GameEngine } from "../engine/GameEngine.ts";
import type { TurnResult } from "../engine/GameEngine.ts";
import { Phase } from "../domain/types.ts";
import { ARMY_COLOR_CACHE, CanvasRenderer } from "../render/CanvasRenderer.ts";
import { Controls } from "../ui/Controls.ts";
import { EventLog } from "../ui/EventLog.ts";

const BASE_TURN_MS = 700; // duración de un turno a velocidad ×1

/** Une motor, render, controles y log; gestiona el bucle de animación. */
export class Simulation {
  private engine!: GameEngine;
  private renderer: CanvasRenderer;
  private controls: Controls;
  private log!: EventLog;

  private playing = false;
  private speed = 1;
  private active: { result: TurnResult; elapsed: number } | null = null;
  private lastTs = 0;

  constructor(
    canvas: HTMLCanvasElement,
    controlsEl: HTMLElement,
    private readonly logEl: HTMLElement,
    private readonly statusEl: HTMLElement,
  ) {
    this.renderer = new CanvasRenderer(canvas, GAME_CONFIG.fieldSize);
    this.controls = new Controls(controlsEl, {
      onPlayPause: (p) => (this.playing = p),
      onStep: () => this.step(),
      onRestart: (n) => this.restart(n),
      onSpeed: (m) => (this.speed = m),
    });
    this.restart(GAME_CONFIG.defaultArmies);
    requestAnimationFrame((ts) => this.frame(ts));
  }

  private restart(armyCount: number): void {
    const agents = Array.from({ length: armyCount }, (_, i) => defaultAgentFor(i));
    this.engine = new GameEngine(agents, { armyCount });
    this.engine.setup();
    this.active = null;
    this.playing = false;
    this.controls.setPlaying(false);

    ARMY_COLOR_CACHE.clear();
    for (const army of this.engine.state.armies) {
      ARMY_COLOR_CACHE.set(army.id, army.color);
    }

    this.log = new EventLog(this.logEl, (id) => this.labelFor(id));
    this.log.clear();
    this.log.line("Fase de preparación completada. ¡A la batalla!", "turn-sep");
    for (const army of this.engine.state.armies) {
      const count = this.engine.state.units.filter((u) => u.armyId === army.id).length;
      this.log.line(`Ejército ${army.id} · ${army.name}: ${count} unidades`);
    }

    this.renderer.draw(this.engine.state);
    this.updateStatus();
  }

  /** Ejecuta un turno y anima su transición. */
  private step(): void {
    if (this.active || this.engine.state.finished) return;
    const result = this.engine.tick();
    this.log.push(result.events);
    this.active = { result, elapsed: 0 };
    this.updateStatus();
  }

  private frame(ts: number): void {
    const dt = this.lastTs ? ts - this.lastTs : 0;
    this.lastTs = ts;

    if (!this.active && this.playing && !this.engine.state.finished) {
      this.step();
    }

    if (this.active) {
      const duration = BASE_TURN_MS / this.speed;
      this.active.elapsed += dt;
      const t = Math.min(1, this.active.elapsed / duration);
      this.renderer.draw(this.engine.state, {
        startPositions: this.active.result.startPositions,
        unitActions: this.active.result.unitActions,
        t,
        ts,
      });
      if (t >= 1) this.active = null;
    } else {
      this.renderer.draw(this.engine.state, { ts });
    }

    if (this.engine.state.finished && this.playing) {
      this.playing = false;
      this.controls.setPlaying(false);
      this.updateStatus();
    }

    requestAnimationFrame((next) => this.frame(next));
  }

  private updateStatus(): void {
    const s = this.engine.state;
    if (s.phase === Phase.Finished) {
      this.statusEl.textContent =
        s.winner === null
          ? `Fin · Empate (turno ${s.turn})`
          : `Fin · Gana ${s.armyById(s.winner)?.name ?? s.winner} (turno ${s.turn})`;
    } else {
      const alive = s.livingArmyIds().length;
      this.statusEl.textContent = `Turno ${s.turn}/${GAME_CONFIG.maxTurns} · ${alive} ejércitos en pie`;
    }
  }

  private labelFor(unitId: string): string {
    const u = this.engine.state.units.find((x) => x.id === unitId);
    if (!u) return unitId;
    return `E${u.armyId}·${UNIT_DEFS[u.type].label} r${u.rank}`;
  }
}
