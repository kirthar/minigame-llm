import { GAME_CONFIG } from "../config/game.ts";

export interface ControlCallbacks {
  onPlayPause: (playing: boolean) => void;
  onStep: () => void;
  onRestart: (armyCount: number) => void;
  onSpeed: (multiplier: number) => void;
  onMaxTurns: (n: number) => void;
}

/** Barra de controles: play/pausa, paso a paso, reinicio, nº ejércitos y velocidad. */
export class Controls {
  private playing = false;
  private readonly playBtn: HTMLButtonElement;
  private readonly stepBtn: HTMLButtonElement;
  private armyCount: number = GAME_CONFIG.defaultArmies;

  constructor(container: HTMLElement, private readonly cb: ControlCallbacks) {
    this.playBtn = button("▶ Play", () => this.togglePlay());
    this.stepBtn = button("⏭ Paso", () => this.cb.onStep());
    const restartBtn = button("↺ Reiniciar", () => this.cb.onRestart(this.armyCount));

    const armySelect = document.createElement("select");
    for (let n = GAME_CONFIG.minArmies; n <= GAME_CONFIG.maxArmies; n++) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `${n} ejércitos`;
      if (n === this.armyCount) opt.selected = true;
      armySelect.appendChild(opt);
    }
    armySelect.addEventListener("change", () => {
      this.armyCount = Number(armySelect.value);
      this.cb.onRestart(this.armyCount);
    });
    const armyLabel = label("Jugadores:", armySelect);

    const speed = document.createElement("input");
    speed.type = "range";
    speed.min = "0.25";
    speed.max = "4";
    speed.step = "0.25";
    speed.value = "1";
    speed.addEventListener("input", () => this.cb.onSpeed(Number(speed.value)));
    const speedLabel = label("Velocidad:", speed);

    const turnsInput = document.createElement("input");
    turnsInput.type = "number";
    turnsInput.min = String(GAME_CONFIG.minTurns);
    turnsInput.max = String(GAME_CONFIG.maxTurnsLimit);
    turnsInput.step = "5";
    turnsInput.value = String(GAME_CONFIG.maxTurns);
    turnsInput.style.width = "60px";
    turnsInput.addEventListener("change", () => {
      const n = Math.max(
        GAME_CONFIG.minTurns,
        Math.min(GAME_CONFIG.maxTurnsLimit, Number(turnsInput.value) || GAME_CONFIG.maxTurns),
      );
      turnsInput.value = String(n);
      this.cb.onMaxTurns(n);
    });
    const turnsLabel = label("Turnos:", turnsInput);

    container.append(
      this.playBtn,
      this.stepBtn,
      restartBtn,
      armyLabel,
      turnsLabel,
      speedLabel,
    );
  }

  private togglePlay(): void {
    this.playing = !this.playing;
    this.playBtn.textContent = this.playing ? "⏸ Pausa" : "▶ Play";
    this.stepBtn.disabled = this.playing;
    this.cb.onPlayPause(this.playing);
  }

  /** Fuerza el estado de pausa (p.ej. al terminar la partida). */
  setPlaying(playing: boolean): void {
    if (this.playing !== playing) this.togglePlay();
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function label(text: string, control: HTMLElement): HTMLLabelElement {
  const l = document.createElement("label");
  l.textContent = text;
  l.appendChild(control);
  return l;
}
