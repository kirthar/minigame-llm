import { Shape } from "../domain/types.ts";

/**
 * Dibuja la figura geométrica de un tipo de unidad centrada en (x, y).
 * El relleno indica el ejército; el trazo (grosor) indica el rango.
 */
export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case Shape.Circle:
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      break;
    case Shape.Square: {
      const s = radius * 1.7;
      ctx.rect(x - s / 2, y - s / 2, s, s);
      break;
    }
    case Shape.Triangle: {
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius * 0.9, y + radius * 0.75);
      ctx.lineTo(x - radius * 0.9, y + radius * 0.75);
      ctx.closePath();
      break;
    }
    case Shape.Diamond: {
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius, y);
      ctx.closePath();
      break;
    }
  }
}
