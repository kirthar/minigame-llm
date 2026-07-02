import type { GameState } from "../domain/GameState.ts";
import type { UnitId, Vec2 } from "../domain/types.ts";
import type { Unit } from "../domain/Unit.ts";
import { lerp } from "../engine/geometry.ts";
import { OrderType } from "../orders/orders.ts";
import { drawShape } from "./shapes.ts";
import { borderWidthForRank } from "./palette.ts";
import { getSprite } from "./spriteLoader.ts";

export interface DrawOptions {
  /** Posiciones de inicio de turno, para interpolar el movimiento. */
  startPositions?: Map<UnitId, Vec2>;
  /** Factor de interpolación 0..1 (0 = inicio de turno, 1 = fin). */
  t?: number;
  /** Timestamp crudo de requestAnimationFrame, reloj de animación independiente de la velocidad de partida. */
  ts?: number;
  /** Orden ejecutada por cada unidad este turno (para decidir el estado de animación). */
  unitActions?: Map<UnitId, OrderType>;
}

const UNIT_RADIUS = 7;
/** Tamaño de dibujo del sprite ilustrado (lado del cuadrado), ~24-40px como pide el brief de arte. */
const SPRITE_SIZE = UNIT_RADIUS * 4.4;

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
    const ts = opts.ts ?? 0;
    for (const unit of state.units) {
      if (!unit.alive) continue;
      const start = opts.startPositions?.get(unit.id);
      const pos = this.displayPos(unit, start, t);
      const action = opts.unitActions?.get(unit.id);
      const moving = !!start && (start.x !== unit.pos.x || start.y !== unit.pos.y);
      this.drawUnit(unit, pos, start, ts, t, action, moving);
    }
  }

  private displayPos(unit: Unit, start: Vec2 | undefined, t: number): Vec2 {
    return start ? lerp(start, unit.pos, t) : unit.pos;
  }

  private drawUnit(
    unit: Unit,
    worldPos: Vec2,
    startPos: Vec2 | undefined,
    ts: number,
    t: number,
    action: OrderType | undefined,
    moving: boolean,
  ): void {
    const { ctx } = this;
    const x = worldPos.x * this.scale;
    const y = worldPos.y * this.scale;
    const color = colorOf(unit);

    const sprite = getSprite(unit.type, unit.rank, unit.armyId, color);
    const spriteReady = sprite.complete && sprite.naturalWidth > 0;

    if (!spriteReady) {
      // Arte aún no decodificada este frame: figura geométrica de respaldo.
      drawShape(ctx, unit.def.shape, x, y, UNIT_RADIUS);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = borderWidthForRank(unit.rank);
      ctx.strokeStyle = "#0b0e12";
      ctx.stroke();
    } else {
      const dx = startPos ? worldPos.x - startPos.x : 0;
      const facingLeft = dx < -1e-6;
      const seed = seedFor(unit.id);
      const attacking = action === OrderType.Attack || action === OrderType.Capture;

      ctx.save();
      ctx.translate(x, y);
      if (facingLeft) ctx.scale(-1, 1);

      const bob = moving ? moveBob(ts, seed) : idleBob(ts, seed);
      let forward = 0;
      if (attacking) {
        const pulseT = Math.max(0, Math.min(1, (t - 0.5) / 0.5));
        forward = Math.sin(pulseT * Math.PI) * SPRITE_SIZE * 0.18;
      }
      if (moving) ctx.rotate(0.06);
      ctx.translate(forward, bob);

      ctx.drawImage(sprite, -SPRITE_SIZE / 2, -SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
      ctx.restore();

      this.drawRankBadge(unit, x, y);
    }

    this.drawHpBar(unit, x, y);
  }

  private drawRankBadge(unit: Unit, x: number, y: number): void {
    const { ctx } = this;
    const bx = x + SPRITE_SIZE * 0.32;
    const by = y - SPRITE_SIZE * 0.42;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0e12";
    ctx.fill();
    ctx.fillStyle = "#e6edf3";
    ctx.font = "bold 8px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(unit.rank), bx, by + 0.5);
  }

  private drawHpBar(unit: Unit, x: number, y: number): void {
    const { ctx } = this;
    const w = 20;
    const h = 3;
    const frac = Math.max(0, Math.min(1, unit.hp / unit.stats().maxHp));
    const top = y - SPRITE_SIZE / 2 - 8;
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

/** Hash estable y barato de un id de unidad, para desfasar el ciclo de animación entre unidades. */
function seedFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 10000;
}

/** Oscilación vertical suave de "respirar" en reposo (amplitud ~1.5px, período 1.6s). */
function idleBob(ts: number, seed: number): number {
  const period = 1600;
  const phase = (((ts + seed) % period) + period) % period / period;
  return Math.sin(phase * Math.PI * 2) * 1.5;
}

/** Oscilación más marcada mientras la unidad se desplaza este turno. */
function moveBob(ts: number, seed: number): number {
  const period = 420;
  const phase = (((ts + seed) % period) + period) % period / period;
  return Math.sin(phase * Math.PI * 2) * 3;
}
