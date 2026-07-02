/**
 * Generador de números aleatorios inyectable. Por defecto usa Math.random, pero
 * puede construirse con una semilla para partidas deterministas (clave para
 * comparar IAs y para los tests).
 */
export interface Rng {
  /** Float en [0, 1). */
  next(): number;
  /** Entero en [min, max] inclusive. */
  int(min: number, max: number): number;
  /** true con probabilidad p. */
  chance(p: number): boolean;
}

class MathRng implements Rng {
  next(): number {
    return Math.random();
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** RNG determinista (mulberry32) para semillas reproducibles. */
class SeededRng implements Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

export function createRng(seed?: number): Rng {
  return seed === undefined ? new MathRng() : new SeededRng(seed);
}
