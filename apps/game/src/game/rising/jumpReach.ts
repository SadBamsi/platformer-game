/**
 * Дальность прыжка dx_max(dy)/x_min(dy) и допустимый коридор D для перехода
 * между платформами. Формулы — apps/game/docs/rising-water.md, раздел 3.
 * Чистый модуль без Phaser — использует только числовые константы из
 * dimensions.ts (лист графа зависимостей, без импорта Phaser).
 */
import {
  PLAYER_JUMP_VELOCITY_COEFFICIENT,
  PLAYER_MOVE_SPEED_BLOCKS_PER_SEC,
  WORLD_GRAVITY_COEFFICIENT,
} from '@/game/dimensions';

/** v — начальная вертикальная скорость прыжка, блок/с (level-design.md §2.3). */
const v = PLAYER_JUMP_VELOCITY_COEFFICIENT;
/** g — гравитация, блок/с² (level-design.md §2.3). */
const g = WORLD_GRAVITY_COEFFICIENT;
/** runSpeed — скорость бега, блок/с (level-design.md §2.4). */
const runSpeed = PLAYER_MOVE_SPEED_BLOCKS_PER_SEC;
/** t_up — время до апекса, с (level-design.md §2.3): t_up = v/g = 0.4. */
const t_up = v / g;

/**
 * h_apex — высота апекса прыжка, блоки. Выводится из v,g (h_apex=v²/2g=5),
 * а не хардкодится отдельной константой — см. level-design.md §2.3,
 * «Проверка обратной подстановкой».
 */
export const H_APEX_ROWS = (v * v) / (2 * g);

/**
 * dx_max(dy) — максимальная горизонтальная дальность прыжка на высоту dy
 * рядов, блоки. rising-water.md §3.1:
 * dx_max(dy) = runSpeed · (t_up + √(2·(h_apex−dy)/g)).
 * Определена только при dy ≤ h_apex (иначе подкоренное выражение
 * отрицательно — прыжок физически недостижим); при dy, близком к h_apex,
 * подставляем max(0, …) под корень, чтобы не возвращать NaN на границе.
 */
export function maxHorizontalReach(dy: number): number {
  const underRoot = Math.max(0, 2 * (H_APEX_ROWS - dy) / g);
  return runSpeed * (t_up + Math.sqrt(underRoot));
}

/**
 * x_min(dy) — момент, когда траектория ВПЕРВЫЕ достигает высоты dy (по пути
 * вверх), блоки. rising-water.md §3.3: x_min(dy) = runSpeed·(v−√(v²−2gdy))/g.
 * Тот же домен ограничения dy ≤ h_apex, что и maxHorizontalReach.
 */
export function minHorizontalReach(dy: number): number {
  const underRoot = Math.max(0, v * v - 2 * g * dy);
  return (runSpeed * (v - Math.sqrt(underRoot))) / g;
}

export interface ReachRange {
  min: number;
  max: number;
}

/**
 * Допустимый диапазон дистанции D между зоной разбега и целевой платформой
 * для перехода на высоту dy. rising-water.md §4.3 (правка волны A —
 * двусторонняя граница вместо только верхней):
 * x_min(dy) + 0.05 ≤ D ≤ 0.7 · dx_max(dy).
 * 0.05 — инженерный зазор от геометрической границы (не «человеческий»
 * запас), 0.7 — запас 30% на неточность тайминга/coyote-buffer люфт
 * (rising-water.md §3.2).
 */
export function safeReachRange(dy: number): ReachRange {
  return {
    min: minHorizontalReach(dy) + 0.05,
    max: 0.7 * maxHorizontalReach(dy),
  };
}
