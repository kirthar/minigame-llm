import type { GameEvent } from "../engine/events.ts";

export type LabelFor = (unitId: string) => string;

/** Panel de registro de eventos por turno. */
export class EventLog {
  constructor(
    private readonly container: HTMLElement,
    private readonly labelFor: LabelFor,
  ) {}

  clear(): void {
    this.container.innerHTML = "";
  }

  line(text: string, cls = "evt"): void {
    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    this.container.appendChild(div);
    this.container.scrollTop = this.container.scrollHeight;
  }

  push(events: GameEvent[]): void {
    for (const e of events) this.render(e);
  }

  private render(e: GameEvent): void {
    switch (e.kind) {
      case "turn":
        this.line(`— Turno ${e.turn} —`, "turn-sep");
        break;
      case "kill":
        this.line(
          `☠ ${this.labelFor(e.victimId)} eliminada` +
            (e.killerId ? ` por ${this.labelFor(e.killerId)}` : ""),
          "evt-kill",
        );
        break;
      case "capture":
        this.line(
          `${e.success ? "⛓ Captura" : "✗ Captura fallida"}: ${this.labelFor(
            e.captorId,
          )} → ${this.labelFor(e.victimId)} (${Math.round(e.probability * 100)}%)`,
          "evt-capture",
        );
        break;
      case "rankup":
        this.line(
          `★ ${this.labelFor(e.unitId)} asciende a rango ${e.newRank}`,
          "evt-rank",
        );
        break;
      case "finished":
        this.line(
          e.winner === null
            ? `🏁 Empate en el turno ${e.turn}`
            : `🏁 Gana el ejército ${e.winner} en el turno ${e.turn}`,
          "turn-sep",
        );
        break;
      // Los ataques individuales se omiten del log para no saturarlo.
      case "attack":
        break;
    }
  }
}
