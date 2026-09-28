/**
 * Seeded PRNG (mulberry32) — детерминированный генератор [0,1) по числовому
 * seed. Используется генератором этапов (`stageGenerator.ts`) с
 * seed = номер этапа, чтобы раскладка была одинаковой у всех игроков
 * (rising-water.md §1, «Seed = номер этапа, поэтому у всех игроков
 * одинаковые этапы и лидерборд честный»).
 *
 * mulberry32 выбран как компактный, быстрый, достаточно качественный для
 * не-криптографической генерации уровней PRNG с 32-битным состоянием —
 * стандартная публичная реализация (не изобретается заново).
 */
export type Rng = () => number;

/** Создаёт генератор случайных чисел в [0,1), детерминированный по seed. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return function mulberry32(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Целое число в [min, max] включительно, по переданному rng. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Вещественное число в [min, max), по переданному rng. */
export function randomFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
