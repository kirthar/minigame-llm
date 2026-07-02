import type { Vec2 } from "../domain/types.ts";

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Vector unitario en la dirección de v (o {0,0} si v es nulo). */
export function normalize(v: Vec2): Vec2 {
  const len = length(v);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

/** Interpolación lineal entre a y b. */
export function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Mantiene un punto dentro de los límites [0, size] del campo. */
export function clampToField(p: Vec2, size: number): Vec2 {
  return {
    x: Math.max(0, Math.min(size, p.x)),
    y: Math.max(0, Math.min(size, p.y)),
  };
}

/**
 * Punto central de la formación de cada ejército, repartidos de forma
 * equidistante sobre un círculo → ninguna ventaja posicional inicial.
 */
export function spawnCenters(
  armyCount: number,
  fieldSize: number,
  radiusFactor: number,
): Vec2[] {
  const center = fieldSize / 2;
  const radius = center * radiusFactor;
  const centers: Vec2[] = [];
  // Empezamos arriba (-90°) y repartimos 360°/n.
  const start = -Math.PI / 2;
  for (let i = 0; i < armyCount; i++) {
    const angle = start + (2 * Math.PI * i) / armyCount;
    centers.push({
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    });
  }
  return centers;
}

/**
 * Coloca `count` unidades en una rejilla compacta centrada en `center`.
 * Sirve para desplegar la formación inicial de un ejército.
 */
export function formationPositions(
  center: Vec2,
  count: number,
  spacing: number,
  fieldSize: number,
): Vec2[] {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const positions: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const offsetX = (col - (cols - 1) / 2) * spacing;
    const offsetY = (row - (rows - 1) / 2) * spacing;
    positions.push(
      clampToField({ x: center.x + offsetX, y: center.y + offsetY }, fieldSize),
    );
  }
  return positions;
}
