import { describe, expect, it } from 'vitest';
import { canReach, type SimPlatform } from '@/game/rising/jumpSimulator';
import {
  exitZoneMaxRow,
  exitZoneMinRow,
  generateStage,
  SPAWN_ZONE_WIDTH,
  validateStage,
} from '@/game/rising/stageGenerator';

describe('canReach — базовая физика прыжка', () => {
  it('открытый шаг на 2 ряда вверх и 2 блока вбок — достижим', () => {
    const A: SimPlatform = { x: 0, row: 0, width: 6 };
    const B: SimPlatform = { x: 8, row: 2, width: 6 };
    expect(canReach(A, B, [A, B])).toBe(true);
  });

  it('шаг выше апекса прыжка (5 рядов) — недостижим', () => {
    const A: SimPlatform = { x: 0, row: 0, width: 6 };
    const B: SimPlatform = { x: 8, row: 5, width: 6 };
    expect(canReach(A, B, [A, B])).toBe(false);
  });

  it('слишком далеко по горизонтали — недостижимо', () => {
    const A: SimPlatform = { x: 0, row: 0, width: 4 };
    const B: SimPlatform = { x: 14, row: 2, width: 4 };
    expect(canReach(A, B, [A, B])).toBe(false);
  });
});

describe('canReach — регрессия бага «верхние платформы недостижимы» (24.09.2026)', () => {
  // Воспроизведение: этап 1, переход A(ряд 10.47)→B(ряд 12.87). Следующая
  // платформа зигзага C висит над зоной разбега A на ~6 рядов выше. Старое
  // правило 4.2b проверяло коридор только до A.row + 5.5 и не учитывало рост
  // игрока (1.5) и толщину платформы (1), поэтому игрок бился о C головой.
  const A: SimPlatform = { x: 5.6, row: 10.47, width: 6 };
  const B: SimPlatform = { x: 13.5, row: 12.87, width: 6 };

  it('без нависающей платформы переход проходим', () => {
    expect(canReach(A, B, [A, B])).toBe(true);
  });

  it('низкий «потолок» над всей зоной разбега и зазором делает переход непроходимым', () => {
    const ceiling: SimPlatform = { x: 4, row: A.row + 3.2, width: 10 };
    expect(canReach(A, B, [A, B, ceiling])).toBe(false);
  });
});

describe('generateStage — каждый переход этапов 1..30 проходим по симуляции прыжка', () => {
  for (let n = 1; n <= 30; n++) {
    it(`этап ${n}`, () => {
      const stage = generateStage(n);
      const exit = { ...stage.exit };
      // Потолок мира: низ на ряду H−1 (см. worldCeiling в stageGenerator.ts).
      const ceiling: SimPlatform = { x: -1, row: stage.heightRows, width: 34 };
      const all: SimPlatform[] = [...stage.platforms, exit, ceiling];
      const chain: SimPlatform[] = [
        { x: stage.spawn.x, row: 0, width: SPAWN_ZONE_WIDTH },
        ...stage.platforms,
        exit,
      ];
      const unreachable: string[] = [];
      for (let i = 0; i < chain.length - 1; i++) {
        if (!canReach(chain[i]!, chain[i + 1]!, all)) {
          unreachable.push(`звено ${i}: ряд ${chain[i]!.row.toFixed(2)} → ${chain[i + 1]!.row.toFixed(2)}`);
        }
      }
      expect(unreachable).toEqual([]);
    });
  }
});

describe('выход ниже потолка мира — регрессия бага «выход в потолке» (24.09.2026)', () => {
  it('у этапов 1..30 выход в зоне [exitZoneMinRow, exitZoneMaxRow], не выше H−6', () => {
    for (let n = 1; n <= 30; n++) {
      const stage = generateStage(n);
      expect(stage.exit.row).toBeLessThanOrEqual(exitZoneMaxRow(stage.heightRows));
      expect(stage.exit.row).toBeGreaterThanOrEqual(exitZoneMinRow(stage.heightRows));
      expect(stage.exit.row).toBeLessThanOrEqual(stage.heightRows - 6);
    }
  });

  it('прыжок под самый потолок мира недостижим: голова упирается в границу', () => {
    const H = 60;
    const A: SimPlatform = { x: 0, row: H - 5, width: 6 };
    const B: SimPlatform = { x: 7, row: H - 2, width: 6 };
    const ceiling: SimPlatform = { x: -1, row: H, width: 34 };
    expect(canReach(A, B, [A, B])).toBe(true);
    expect(canReach(A, B, [A, B, ceiling])).toBe(false);
  });

  it('validateStage отвергает этап с выходом в потолке', () => {
    const stage = generateStage(1);
    const broken = { ...stage, exit: { ...stage.exit, row: stage.heightRows - 1 } };
    expect(validateStage(broken).valid).toBe(false);
  });
});

describe('generateStage — неверный номер этапа', () => {
  it('падает сразу с понятной ошибкой, а не перебирает попытки минутами', () => {
    expect(() => generateStage(undefined as unknown as number)).toThrow(/целым >= 1/);
    expect(() => generateStage(0)).toThrow(/целым >= 1/);
    expect(() => generateStage(1.5)).toThrow(/целым >= 1/);
  });
});
