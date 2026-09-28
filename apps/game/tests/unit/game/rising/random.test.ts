import { describe, expect, it } from 'vitest';
import { createRng, randomFloat, randomInt } from '@/game/rising/random';

describe('createRng — детерминированный mulberry32 по seed', () => {
  it('одинаковый seed -> одинаковая последовательность чисел', () => {
    const rngA = createRng(42);
    const rngB = createRng(42);
    const seqA = Array.from({ length: 20 }, () => rngA());
    const seqB = Array.from({ length: 20 }, () => rngB());
    expect(seqA).toEqual(seqB);
  });

  it('разный seed -> разная последовательность (с подавляющей вероятностью)', () => {
    const rngA = createRng(1);
    const rngB = createRng(2);
    const seqA = Array.from({ length: 10 }, () => rngA());
    const seqB = Array.from({ length: 10 }, () => rngB());
    expect(seqA).not.toEqual(seqB);
  });

  it('все значения в [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seed=0 не ломает генератор (частый edge case для XOR-based PRNG)', () => {
    const rng = createRng(0);
    const values = Array.from({ length: 5 }, () => rng());
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('randomInt — целое в [min,max] включительно', () => {
  it('всегда попадает в границы [min,max] на большой выборке', () => {
    const rng = createRng(123);
    for (let i = 0; i < 2000; i++) {
      const v = randomInt(rng, 5, 9);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it('min === max всегда возвращает это единственное значение', () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) {
      expect(randomInt(rng, 3, 3)).toBe(3);
    }
  });
});

describe('randomFloat — вещественное в [min,max)', () => {
  it('всегда попадает в [min,max) на большой выборке', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const v = randomFloat(rng, 2, 4);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(4);
    }
  });
});
