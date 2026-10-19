/**
 * Деревья-декорации на платформах. Чистый модуль без Phaser, единицы сетки:
 * x — блоки, ряды — от земли вверх (как в stageGenerator.ts).
 *
 * Деревья — только картинки: у них нет физического тела, они не входят в
 * группу платформ, поэтому не влияют ни на прыжки, ни на проверку
 * проходимости этапа.
 *
 * Расстановка детерминирована по номеру этапа, но идёт от СВОЕГО генератора
 * случайных чисел: если брать числа из генератора этапа, сдвинулась бы
 * раскладка платформ.
 *
 * Картинки: public/assets/tree_spruce.svg и tree_leafy.svg
 * (scripts/generate-trees.mjs), холст 32×32 как у дома → 3×3 блока, низ
 * ствола — нижний край холста. Рисунок уже холста: крона занимает столбцы
 * 3..28, то есть ±13 пикселей от оси (≈ ±1.22 блока).
 */
import { GRID_COLUMNS } from '@/game/dimensions';
import { HOUSE_SIZE_BLOCKS } from './goal';
import { createRng, type Rng } from './random';
import type { PlatformSpec, Stage } from './stageGenerator';

export type TreeKind = 'spruce' | 'leafy';

export const TREE_KINDS: readonly TreeKind[] = ['spruce', 'leafy'];

export interface Decoration {
  kind: TreeKind;
  /** Ось ствола, блоки. */
  centerX: number;
  /** Ряд, на котором стоит дерево (верх платформы). */
  baseRow: number;
}

/** Картинка дерева на экране, блоки (как у дома). */
export const TREE_SIZE_BLOCKS = 3;
/** Половина ширины нарисованной кроны с запасом, блоки: дерево не свисает с платформы. */
export const TREE_HALF_WIDTH_BLOCKS = 1.25;
/** Высота нарисованного дерева с запасом, ряды: над ним не должно быть платформ. */
export const TREE_HEIGHT_ROWS = 3;

/** Доля платформ пути, на которых растёт дерево. */
const TREE_CHANCE = 0.35;
/** Сколько деревьев пробуем поставить на землю (она во всю ширину мира). */
const GROUND_TREE_ATTEMPTS = 3;
/** Минимальный зазор между деревьями, блоки. */
const TREE_GAP_BLOCKS = 0.5;
/**
 * Смешивается с номером этапа в seed декораций, чтобы их поток случайных
 * чисел не совпадал с потоком генератора этапа (seed = n).
 */
const DECORATION_SEED_SALT = 0x9e3779b9;

interface Rect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;
}

function treeRect(centerX: number, baseRow: number): Rect {
  return {
    left: centerX - TREE_HALF_WIDTH_BLOCKS,
    right: centerX + TREE_HALF_WIDTH_BLOCKS,
    bottom: baseRow,
    top: baseRow + TREE_HEIGHT_ROWS,
  };
}

/** Блок платформы: толщина 1 ряд, верх на ряду row. */
function platformRect(p: PlatformSpec): Rect {
  return { left: p.x, right: p.x + p.width, bottom: p.row - 1, top: p.row };
}

/** Seed декораций этапа n: другой, чем у генератора этапа. */
export function decorationSeed(n: number): number {
  return (Math.imul(n, DECORATION_SEED_SALT) ^ 0x5bd1e995) >>> 0;
}

/**
 * Где на этапе стоят деревья. Дерево ставится, только если:
 * - вся его крона над платформой (не свисает с края);
 * - в его прямоугольнике нет ни одной платформы и дома — дерево не
 *   закрывает то, на что игроку нужно смотреть;
 * - оно не залезает на соседнее дерево.
 * Платформа выхода остаётся свободной — на ней дом.
 */
export function placeDecorations(stage: Stage): Decoration[] {
  const rng: Rng = createRng(decorationSeed(stage.n));
  const ground: PlatformSpec = { x: 0, row: 0, width: GRID_COLUMNS };
  const exit: PlatformSpec = { x: stage.exit.x, row: stage.exit.row, width: stage.exit.width };
  const houseCenter = exit.x + exit.width / 2;
  const blockers: Rect[] = [
    ...[ground, ...stage.platforms, exit].map(platformRect),
    {
      left: houseCenter - HOUSE_SIZE_BLOCKS / 2,
      right: houseCenter + HOUSE_SIZE_BLOCKS / 2,
      bottom: exit.row,
      top: exit.row + HOUSE_SIZE_BLOCKS,
    },
  ];

  const trees: Decoration[] = [];
  const tryPlace = (p: PlatformSpec): void => {
    // Число случайных вызовов на попытку всегда одно и то же (3), чтобы
    // отказ на одной платформе не менял деревья на следующих.
    const t = rng();
    const kind: TreeKind = rng() < 0.5 ? 'spruce' : 'leafy';
    const chance = rng();
    if (p !== ground && chance >= TREE_CHANCE) return;

    const minX = p.x + TREE_HALF_WIDTH_BLOCKS;
    const maxX = p.x + p.width - TREE_HALF_WIDTH_BLOCKS;
    if (maxX < minX) return;
    const centerX = minX + t * (maxX - minX);
    const rect = treeRect(centerX, p.row);

    if (blockers.some((b) => overlaps(rect, b))) return;
    const tooClose = trees.some(
      (tree) =>
        tree.baseRow === p.row &&
        Math.abs(tree.centerX - centerX) < 2 * TREE_HALF_WIDTH_BLOCKS + TREE_GAP_BLOCKS,
    );
    if (tooClose) return;

    trees.push({ kind, centerX, baseRow: p.row });
  };

  for (let i = 0; i < GROUND_TREE_ATTEMPTS; i++) tryPlace(ground);
  for (const p of stage.platforms) tryPlace(p);
  return trees;
}
