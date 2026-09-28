import { describe, expect, it } from 'vitest';
import { Water } from '@/game/rising/Water';

function makeWater(overrides: Partial<{ heightRows: number; speedRowsPerSec: number; startDelaySeconds: number }> = {}) {
  return new Water({
    heightRows: overrides.heightRows ?? 60,
    speedRowsPerSec: overrides.speedRowsPerSec ?? 1,
    startDelaySeconds: overrides.startDelaySeconds ?? 3,
  });
}

describe('Water.surfaceRow — задержка старта (rising-water.md §2.3)', () => {
  it('до истечения startDelaySeconds surfaceRow остаётся 0', () => {
    const water = makeWater({ startDelaySeconds: 3 });
    water.update(1);
    water.update(1.9); // итого 2.9с < 3с
    expect(water.surfaceRow).toBe(0);
  });

  it('ровно в момент startDelaySeconds surfaceRow всё ещё 0 (задержка не включает сам момент старта)', () => {
    const water = makeWater({ startDelaySeconds: 3 });
    water.update(3);
    expect(water.surfaceRow).toBe(0);
  });

  it('сразу после задержки вода начинает расти пропорционально прошедшему времени', () => {
    const water = makeWater({ startDelaySeconds: 3, speedRowsPerSec: 2 });
    water.update(3);
    water.update(1); // 1с активного подъёма
    expect(water.surfaceRow).toBeCloseTo(2, 9); // 2 ряд/с * 1с
  });
});

describe('Water.surfaceRow — скорость подъёма', () => {
  it('surfaceRow растёт линейно как speedRowsPerSec * (t - delay)', () => {
    const water = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 0.5 });
    water.update(10);
    expect(water.surfaceRow).toBeCloseTo(5, 9);
  });

  it('несколько маленьких update() дают тот же результат, что один большой (аддитивность времени)', () => {
    const waterBig = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 1.5 });
    waterBig.update(10);

    const waterSmall = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 1.5 });
    for (let i = 0; i < 10; i++) waterSmall.update(1);

    expect(waterSmall.surfaceRow).toBeCloseTo(waterBig.surfaceRow, 9);
  });
});

describe('Water.surfaceRow — clamp на heightRows (потолок H(n))', () => {
  it('не превышает heightRows, даже если прошло намного больше времени, чем T(n)', () => {
    const water = makeWater({ heightRows: 60, speedRowsPerSec: 1, startDelaySeconds: 0 });
    water.update(1000);
    expect(water.surfaceRow).toBe(60);
  });

  it('не уходит в отрицательное значение при отрицательном dtSec (update клампит на 0)', () => {
    const water = makeWater({ startDelaySeconds: 0 });
    water.update(-100);
    expect(water.surfaceRow).toBe(0);
  });
});

describe('Water.isDrowned — граница footRow+0.75 (rising-water.md §2.4, нестрогое >=)', () => {
  it('surfaceRow строго ниже footRow+0.75 — НЕ утонул', () => {
    const water = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 1 });
    water.update(4.7); // surfaceRow = 4.7, footRow+0.75 = 5+0.75=5.75 для footRow=5
    expect(water.isDrowned(5)).toBe(false);
  });

  it('surfaceRow РОВНО на границе footRow+0.75 — утонул (нестрогое >=)', () => {
    const water = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 1 });
    water.update(5.75); // surfaceRow = 5.75, footRow=5 -> footRow+0.75=5.75
    expect(water.isDrowned(5)).toBe(true);
  });

  it('surfaceRow выше границы — утонул', () => {
    const water = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 1 });
    water.update(6);
    expect(water.isDrowned(5)).toBe(true);
  });

  it('surfaceRow=0 (до задержки), игрок стоит на земле (footRow=0) — не утонул', () => {
    const water = makeWater({ startDelaySeconds: 3 });
    expect(water.isDrowned(0)).toBe(false);
  });
});

describe('Water.reset — сбрасывает время (рестарт этапа с тем же seed)', () => {
  it('после reset() surfaceRow возвращается к состоянию "как будто update() ещё не вызывался"', () => {
    const water = makeWater({ startDelaySeconds: 0, speedRowsPerSec: 1 });
    water.update(10);
    expect(water.surfaceRow).toBeCloseTo(10, 9);

    water.reset();
    expect(water.surfaceRow).toBe(0);
  });

  it('после reset() update() снова считает время с нуля', () => {
    const water = makeWater({ startDelaySeconds: 3, speedRowsPerSec: 2 });
    water.update(3);
    water.update(2);
    expect(water.surfaceRow).toBeCloseTo(4, 9);

    water.reset();
    water.update(3);
    expect(water.surfaceRow).toBe(0); // всё ещё в пределах задержки после сброса
  });
});

describe('Water — конфигурация хранится как передана (heightRows/speedRowsPerSec/startDelaySeconds)', () => {
  it('публичные readonly поля отражают конструктор', () => {
    const water = makeWater({ heightRows: 80, speedRowsPerSec: 1.333, startDelaySeconds: 3 });
    expect(water.heightRows).toBe(80);
    expect(water.speedRowsPerSec).toBeCloseTo(1.333, 9);
    expect(water.startDelaySeconds).toBe(3);
  });
});
