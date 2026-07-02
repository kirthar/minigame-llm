import type { GameState } from "../domain/GameState.ts";
import type { UnitId, Vec2 } from "../domain/types.ts";
import type { Unit } from "../domain/Unit.ts";
import { lerp } from "../engine/geometry.ts";
import { drawShape } from "./shapes.ts";
import { borderWidthForRank } from "./palette.ts";

export interface DrawOptions {
  /** Posiciones de inicio de turno, para interpolar el movimiento. */
  startPositions?: Map<UnitId, Vec2>;
  /** Factor de interpolación 0..1 (0 = inicio de turno, 1 = fin). */
  t?: number;
}

const UNIT_RADIUS = 7;

/** Dibuja el campo de batalla y las unidades en un canvas 2D. */
export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scale: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    fieldSize: number,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");
    this.ctx = ctx;
    this.scale = canvas.width / fieldSize;
  }

  draw(state: GameState, opts: DrawOptions = {}): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid();

    const t = opts.t ?? 1;
    for (const unit of state.units) {
      if (!unit.alive) continue;
      const pos = this.displayPos(unit, opts.startPositions, t);
      this.drawUnit(unit, pos);
    }
  }

  private displayPos(unit: Unit, start: Map<UnitId, Vec2> | undefined, t: number): Vec2 {
    const from = start?.get(unit.id);
    return from ? lerp(from, unit.pos, t) : unit.pos;
  }

  private drawUnit(unit: Unit, worldPos: Vec2): void {
    const { ctx } = this;
    const x = worldPos.x * this.scale;
    const y = worldPos.y * this.scale;
    const color = colorOf(unit);

    drawShape(ctx, unit.def.shape, x, y, UNIT_RADIUS);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = borderWidthForRank(unit.rank);
    ctx.strokeStyle = "#0b0e12";
    ctx.stroke();

    ctx.fillStyle = "#0b0e12";
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(unit.rank), x, y + 0.5);

    this.drawHpBar(unit, x, y);
  }

  private drawHpBar(unit: Unit, x: number, y: number): void {
    const { ctx } = this;
    const w = 20;
    const h = 3;
    const frac = Math.max(0, Math.min(1, unit.hp / unit.stats().maxHp));
    const top = y - UNIT_RADIUS - 8;
    ctx.fillStyle = "#2b333d";
    ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = frac > 0.5 ? "#7ee787" : frac > 0.25 ? "#ffd166" : "#ff6b6b";
    ctx.fillRect(x - w / 2, top, w * frac, h);
  }

  private drawGrid(): void {
    const { ctx } = this;
    const size = this.canvas.width;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    const step = size / 12;
    for (let i = 1; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }
  }
}

/** Guarda el color por armyId; se rellena desde el estado al dibujar. */
function colorOf(unit: Unit): string {
  return ARMY_COLOR_CACHE.get(unit.armyId) ?? "#888";
}

/** Cache de colores por ejército, poblada por el renderer al iniciar. */
export const ARMY_COLOR_CACHE = new Map<number, string>();
