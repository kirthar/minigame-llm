import { NVIDIA_MODELS } from "../config/models.ts";

export class AgentSelector {
  private readonly selections: string[] = [];

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: (armyIndex: number, agentKey: string) => void,
  ) {}

  /** Reconstruye los controles cuando cambia el número de ejércitos o los colores. */
  update(armyCount: number, colors: string[]): void {
    this.container.innerHTML = "";

    for (let i = 0; i < armyCount; i++) {
      const color = colors[i] ?? "#888";
      const currentKey = this.selections[i] ?? "utility";

      const row = document.createElement("div");
      row.className = "agent-row";

      const dot = document.createElement("span");
      dot.className = "army-dot";
      dot.style.background = color;

      const select = document.createElement("select");
      select.className = "agent-select";

      const utilityOpt = document.createElement("option");
      utilityOpt.value = "utility";
      utilityOpt.textContent = "IA (Utilidad)";
      if (currentKey === "utility") utilityOpt.selected = true;
      select.appendChild(utilityOpt);

      for (const model of NVIDIA_MODELS) {
        const opt = document.createElement("option");
        opt.value = model.id;
        opt.textContent = model.label;
        if (currentKey === model.id) opt.selected = true;
        select.appendChild(opt);
      }

      const armyIndex = i;
      select.addEventListener("change", () => {
        this.selections[armyIndex] = select.value;
        this.cb(armyIndex, select.value);
      });

      row.append(dot, select);
      this.container.appendChild(row);
    }
  }

  getKey(armyIndex: number): string {
    return this.selections[armyIndex] ?? "utility";
  }
}
