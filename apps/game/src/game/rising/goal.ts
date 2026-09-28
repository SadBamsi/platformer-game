/**
 * Дом-цель на платформе выхода. Чистый модуль без Phaser, единицы сетки:
 * x — блоки, ряды — от земли вверх (как в stageGenerator.ts).
 *
 * Победа засчитывается только при касании дома, а не при приземлении на
 * платформу выхода: игрок должен дойти до двери.
 *
 * Картинка: public/assets/house_goal.svg, viewBox 32×32. Рисунок занимает
 * не весь холст: стены — x 10..22, от конька крыши до низа сугроба —
 * y 8..29 (низ снежного сугроба на y=29). Эти числа ниже — оттуда.
 */
export interface PlatformLike {
  x: number;
  row: number;
  width: number;
}

/** Ширина и высота картинки дома на экране, блоки (холст 32×32 → 3×3 блока). */
export const HOUSE_SIZE_BLOCKS = 3;

const SVG_UNITS = 32;
/** Низ сугроба в координатах SVG — эта линия стоит на верхе платформы. */
const SVG_BASELINE_Y = 29;
/** Стены дома в координатах SVG — по ним считается касание. */
const SVG_WALL_LEFT = 10;
const SVG_WALL_RIGHT = 22;

export interface HousePlacement {
  /** Центр картинки по x, блоки. */
  centerX: number;
  /** Ряд, на котором стоит дом (верх платформы выхода). */
  baseRow: number;
  /** Доля высоты картинки от верха до линии, стоящей на платформе (origin Y). */
  originY: number;
  /** Зона касания: прямоугольник стен над платформой. */
  trigger: { x: number; width: number; bottomRow: number; heightRows: number };
}

/** Где стоит дом и где его зона касания. Дом — по центру платформы выхода. */
export function housePlacement(exit: PlatformLike): HousePlacement {
  const unit = HOUSE_SIZE_BLOCKS / SVG_UNITS;
  const centerX = exit.x + exit.width / 2;
  const wallsWidth = (SVG_WALL_RIGHT - SVG_WALL_LEFT) * unit;
  return {
    centerX,
    baseRow: exit.row,
    originY: SVG_BASELINE_Y / SVG_UNITS,
    trigger: {
      x: centerX - wallsWidth / 2,
      width: wallsWidth,
      bottomRow: exit.row,
      // Рост игрока — 1.5 ряда: этого хватает, чтобы зона ловила игрока,
      // который идёт по платформе, и не ловила его в прыжке мимо дома снизу.
      heightRows: 1.5,
    },
  };
}
