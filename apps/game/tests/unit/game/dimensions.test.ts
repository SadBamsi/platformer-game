import { describe, expect, it } from 'vitest';
import {
  GRID_COLUMNS,
  GRID_ROWS,
  PLAYER_JUMP_VELOCITY_COEFFICIENT,
  WORLD_GRAVITY_COEFFICIENT,
} from '@/game/dimensions';

/**
 * Значения выведены в apps/game/docs/level-design.md, раздел 2.3, из
 * дизайн-целей h_apex=5 блоков, t_up=0.4с:
 *   v = 2*h_apex/t_up = 25 блок/с
 *   g = v/t_up        = 62.5 блок/с²
 * Обратная проверка: h_apex = v²/(2g) должно снова дать 5.
 */
describe('dimensions — коэффициенты физики прыжка (level-design.md §2.3)', () => {
  it('WORLD_GRAVITY_COEFFICIENT = 62.5 (g = v/t_up)', () => {
    expect(WORLD_GRAVITY_COEFFICIENT).toBe(62.5);
  });

  it('PLAYER_JUMP_VELOCITY_COEFFICIENT = 25 (v = 2*h_apex/t_up)', () => {
    expect(PLAYER_JUMP_VELOCITY_COEFFICIENT).toBe(25);
  });

  it('обратная подстановка даёт h_apex = 5 блоков и t_up = 0.4с', () => {
    const v = PLAYER_JUMP_VELOCITY_COEFFICIENT;
    const g = WORLD_GRAVITY_COEFFICIENT;
    const hApex = (v * v) / (2 * g);
    const tUp = v / g;

    expect(hApex).toBeCloseTo(5, 10);
    expect(tUp).toBeCloseTo(0.4, 10);
  });

  it('сетка 32x18 не изменена (level-design.md построен именно на ней)', () => {
    expect(GRID_COLUMNS).toBe(32);
    expect(GRID_ROWS).toBe(18);
  });
});
