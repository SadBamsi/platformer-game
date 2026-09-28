/**
 * Кривая сложности режима «Вода поднимается». Формулы и обоснования —
 * apps/game/docs/rising-water.md, раздел 2.1 («Формулы») и раздел 8
 * («Хэндофф для nextjs-frontend-engineer», сводка готовых формул).
 * Чистый модуль без Phaser — тестируется без движка (см. handoff волны C).
 */

/**
 * Задержка перед началом подъёма воды, секунды. Решение пользователя,
 * зафиксировано в rising-water.md §2.3 — НЕ выводится формулой.
 */
export const WATER_START_DELAY_SECONDS = 3;

/**
 * Вода временно выключена по просьбе пользователя (24.09.2026), пока
 * доводим раскладку этапов. Код воды остаётся: сцена его просто не
 * вызывает, HUD прячет индикатор. Вернуть — поставить true.
 */
export const WATER_ENABLED = false;

/**
 * Диапазон вертикального шага между платформами, ряды. Константы, НЕ
 * функции этапа n — rising-water.md §3.4 (правка волны A: dyMax не растёт
 * после этапа 10, иначе окно дальности схлопывается при dy→h_apex=5).
 */
export const DY_MIN_ROWS = 2;
export const DY_MAX_ROWS = 4;

/**
 * T(n) — время подъёма воды на всю высоту этапа H(n), секунды.
 * rising-water.md §2.1: T(n) = max(60, 120 − (n−1)·60/9).
 * T(1)=120, T(10)=60, дальше плато на 60.
 */
export function waterRiseSeconds(n: number): number {
  return Math.max(60, 120 - ((n - 1) * 60) / 9);
}

/**
 * H(n) — высота этапа, ряды. rising-water.md §2.1:
 * H(n)=60 при n≤10; H(n)=min(120, 60+4·(n−10)) при n>10 (потолок 120 на n=25).
 */
export function stageHeightRows(n: number): number {
  if (n <= 10) return 60;
  return Math.min(120, 60 + 4 * (n - 10));
}

/**
 * v_water(n) = H(n)/T(n), ряд/с — скорость подъёма воды. Не константа: при
 * фиксированной H и падающем T скорость растёт сама, а после этапа 10 растёт
 * ещё и из-за растущей H (rising-water.md §2.1).
 */
export function waterSpeedRowsPerSec(n: number): number {
  return stageHeightRows(n) / waterRiseSeconds(n);
}

/**
 * width(n) — ширина платформы, блоки. rising-water.md §5:
 * линейно от 6 (этап 1) до 3 (этап 10), пол 3 после этапа 10.
 * Пол 3 блока — минимум, при котором на платформе физически помещается
 * стоящий игрок с посадочным допуском по обе стороны (0.5+1+0.5=2) плюс
 * минимальный зазор для следующего перехода (rising-water.md §5, «Пол
 * ширины платформы»).
 */
export function platformWidthBlocks(n: number): number {
  if (n <= 10) return Math.max(3, 6 - ((n - 1) * 3) / 9);
  return 3;
}
