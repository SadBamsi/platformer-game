import { describe, expect, it } from 'vitest';
import {
  H_APEX_ROWS,
  maxHorizontalReach,
  minHorizontalReach,
  safeReachRange,
} from '@/game/rising/jumpReach';

describe('H_APEX_ROWS — высота апекса прыжка выведена из v,g (level-design.md §2.3)', () => {
  it('H_APEX_ROWS = 5 (v=25, g=62.5 -> v²/2g = 625/125 = 5)', () => {
    expect(H_APEX_ROWS).toBeCloseTo(5, 9);
  });
});

describe('maxHorizontalReach(dy) — таблица rising-water.md §3.1', () => {
  it('dx_max(0) ≈ 5.500', () => {
    expect(maxHorizontalReach(0)).toBeCloseTo(5.5, 2);
  });

  it('dx_max(1) ≈ 5.210', () => {
    expect(maxHorizontalReach(1)).toBeCloseTo(5.21, 2);
  });

  it('dx_max(2) ≈ 4.880', () => {
    expect(maxHorizontalReach(2)).toBeCloseTo(4.88, 2);
  });

  it('dx_max(3) ≈ 4.489', () => {
    expect(maxHorizontalReach(3)).toBeCloseTo(4.489, 2);
  });

  it('dx_max(4) ≈ 3.980', () => {
    expect(maxHorizontalReach(4)).toBeCloseTo(3.98, 2);
  });

  it('строго убывает с ростом dy на [0,4]', () => {
    let prev = maxHorizontalReach(0);
    for (let dy = 0.5; dy <= 4; dy += 0.5) {
      const cur = maxHorizontalReach(dy);
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });

  it('на границе dy=h_apex не возвращает NaN (max(0, …) под корнем)', () => {
    expect(Number.isNaN(maxHorizontalReach(H_APEX_ROWS))).toBe(false);
    expect(maxHorizontalReach(H_APEX_ROWS)).toBeGreaterThan(0);
  });
});

describe('minHorizontalReach(dy) — таблица x_min rising-water.md §3.3', () => {
  it('x_min(0) = 0', () => {
    expect(minHorizontalReach(0)).toBeCloseTo(0, 6);
  });

  it('x_min(1) ≈ 0.290', () => {
    expect(minHorizontalReach(1)).toBeCloseTo(0.29, 2);
  });

  it('x_min(2) ≈ 0.620', () => {
    expect(minHorizontalReach(2)).toBeCloseTo(0.62, 2);
  });

  it('x_min(3) ≈ 1.010 (совпадает с level-design.md §6, R=3)', () => {
    expect(minHorizontalReach(3)).toBeCloseTo(1.01, 2);
  });

  it('x_min(4) ≈ 1.520 (совпадает с level-design.md §6, R=4)', () => {
    expect(minHorizontalReach(4)).toBeCloseTo(1.52, 2);
  });

  it('строго возрастает с ростом dy на [0,4]', () => {
    let prev = minHorizontalReach(0);
    for (let dy = 0.5; dy <= 4; dy += 0.5) {
      const cur = minHorizontalReach(dy);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });

  it('x_min(dy) < x_max(dy) для каждого dy в [0,4] (окно непустое до применения коэффициента 0.7)', () => {
    for (let dy = 0; dy <= 4; dy += 0.5) {
      expect(minHorizontalReach(dy)).toBeLessThan(maxHorizontalReach(dy));
    }
  });
});

describe('safeReachRange(dy) — [x_min+0.05, 0.7·x_max] (rising-water.md §4.3)', () => {
  it('dy=2 -> [0.62+0.05, 0.7*4.88] ≈ [0.67, 3.42]', () => {
    const r = safeReachRange(2);
    expect(r.min).toBeCloseTo(0.67, 2);
    expect(r.max).toBeCloseTo(3.416, 1);
  });

  it('dy=3 -> [1.06, 3.14]', () => {
    const r = safeReachRange(3);
    expect(r.min).toBeCloseTo(1.06, 2);
    expect(r.max).toBeCloseTo(3.14, 1);
  });

  it('dy=4 -> [1.57, 2.79] — самое узкое окно из проходимых dy', () => {
    const r = safeReachRange(4);
    expect(r.min).toBeCloseTo(1.57, 2);
    expect(r.max).toBeCloseTo(2.786, 1);
  });

  it('диапазон непустой (min < max) для всех dy в [2,4] — DY_MIN_ROWS..DY_MAX_ROWS', () => {
    for (let dy = 2; dy <= 4; dy += 0.25) {
      const r = safeReachRange(dy);
      expect(r.min).toBeLessThan(r.max);
    }
  });

  it('min строго положителен (0.05 инженерный зазор всегда добавлен)', () => {
    expect(safeReachRange(0).min).toBeCloseTo(0.05, 6);
  });
});
