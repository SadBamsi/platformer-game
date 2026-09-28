import { describe, expect, it } from 'vitest';
import {
  DY_MAX_ROWS,
  DY_MIN_ROWS,
  WATER_START_DELAY_SECONDS,
  platformWidthBlocks,
  stageHeightRows,
  waterRiseSeconds,
  waterSpeedRowsPerSec,
} from '@/game/rising/difficulty';

/**
 * Формулы rising-water.md §2.1/§5. Числа таблицы §2.2 и утверждения §7
 * («dyMax не растёт после этапа 10», «пол 3 блока», «плато T=60») проверяются
 * напрямую, а не переизобретаются в тесте.
 */
describe('waterRiseSeconds — T(n) = max(60, 120 − (n−1)·60/9)', () => {
  it('T(1) = 120', () => {
    expect(waterRiseSeconds(1)).toBe(120);
  });

  it('T(10) = 60', () => {
    expect(waterRiseSeconds(10)).toBe(60);
  });

  it('T(15) = 60 (плато после этапа 10)', () => {
    expect(waterRiseSeconds(15)).toBe(60);
  });

  it('T(n) не убывает ниже пола 60 даже для очень больших n', () => {
    expect(waterRiseSeconds(1000)).toBe(60);
  });

  it('монотонно НЕ возрастает по n (не строго убывает — после 10 константа)', () => {
    let prev = waterRiseSeconds(1);
    for (let n = 2; n <= 30; n++) {
      const cur = waterRiseSeconds(n);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it('таблица §2.2: T(2)≈113.33, T(3)≈106.67, T(5)≈93.33, T(8)≈73.33', () => {
    expect(waterRiseSeconds(2)).toBeCloseTo(113.333, 2);
    expect(waterRiseSeconds(3)).toBeCloseTo(106.667, 2);
    expect(waterRiseSeconds(5)).toBeCloseTo(93.333, 2);
    expect(waterRiseSeconds(8)).toBeCloseTo(73.333, 2);
  });
});

describe('stageHeightRows — H(n): 60 при n<=10, потом +4/этап с потолком 120', () => {
  it('H(n)=60 для n от 1 до 10', () => {
    for (let n = 1; n <= 10; n++) {
      expect(stageHeightRows(n)).toBe(60);
    }
  });

  it('H(11)=64, H(15)=80, H(20)=100', () => {
    expect(stageHeightRows(11)).toBe(64);
    expect(stageHeightRows(15)).toBe(80);
    expect(stageHeightRows(20)).toBe(100);
  });

  it('H(25)=120 — потолок достигается ровно на этапе 25', () => {
    expect(stageHeightRows(25)).toBe(120);
  });

  it('потолок 120 держится и после этапа 25 (H(30)=120, не 140)', () => {
    expect(stageHeightRows(30)).toBe(120);
    expect(stageHeightRows(50)).toBe(120);
  });

  it('монотонно не убывает по n', () => {
    let prev = stageHeightRows(1);
    for (let n = 2; n <= 40; n++) {
      const cur = stageHeightRows(n);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe('waterSpeedRowsPerSec — v_water(n) = H(n)/T(n), потолок 2.0 ряд/с на этапе 25', () => {
  it('v_water(1) = 60/120 = 0.5', () => {
    expect(waterSpeedRowsPerSec(1)).toBeCloseTo(0.5, 6);
  });

  it('v_water(10) = 60/60 = 1.0', () => {
    expect(waterSpeedRowsPerSec(10)).toBeCloseTo(1.0, 6);
  });

  it('v_water(25) = 120/60 = 2.0 — максимум, достигается ровно на этапе 25', () => {
    expect(waterSpeedRowsPerSec(25)).toBeCloseTo(2.0, 6);
  });

  it('скорость воды не превышает потолок 2.0 ряд/с ни на одном из этапов 1..30', () => {
    for (let n = 1; n <= 30; n++) {
      expect(waterSpeedRowsPerSec(n)).toBeLessThanOrEqual(2.0 + 1e-9);
    }
  });

  it('монотонно не убывает по n (скорость только растёт или держится на потолке)', () => {
    let prev = waterSpeedRowsPerSec(1);
    for (let n = 2; n <= 30; n++) {
      const cur = waterSpeedRowsPerSec(n);
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });
});

describe('platformWidthBlocks — width(n): 6→3 линейно до этапа 10, пол 3 после', () => {
  it('width(1) = 6 (максимум)', () => {
    expect(platformWidthBlocks(1)).toBe(6);
  });

  it('width(10) = 3 (минимум/пол)', () => {
    expect(platformWidthBlocks(10)).toBeCloseTo(3, 9);
  });

  it('width(n) = 3 для всех n > 10 (пол держится)', () => {
    for (const n of [11, 15, 20, 30]) {
      expect(platformWidthBlocks(n)).toBe(3);
    }
  });

  it('монотонно не возрастает по n', () => {
    let prev = platformWidthBlocks(1);
    for (let n = 2; n <= 30; n++) {
      const cur = platformWidthBlocks(n);
      expect(cur).toBeLessThanOrEqual(prev + 1e-9);
      prev = cur;
    }
  });

  it('никогда не опускается ниже пола 3 блока', () => {
    for (let n = 1; n <= 30; n++) {
      expect(platformWidthBlocks(n)).toBeGreaterThanOrEqual(3 - 1e-9);
    }
  });
});

describe('Константы диапазона шага и задержки воды (rising-water.md §2.3/§3.4)', () => {
  it('WATER_START_DELAY_SECONDS = 3', () => {
    expect(WATER_START_DELAY_SECONDS).toBe(3);
  });

  it('DY_MIN_ROWS = 2, DY_MAX_ROWS = 4', () => {
    expect(DY_MIN_ROWS).toBe(2);
    expect(DY_MAX_ROWS).toBe(4);
  });
});
