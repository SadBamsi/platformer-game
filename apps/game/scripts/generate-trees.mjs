#!/usr/bin/env node
/**
 * Генератор пиксель-арт деревьев-декораций (SVG): ель в снегу и лиственное
 * дерево с яблоками.
 *
 * Запуск из apps/game:  node scripts/generate-trees.mjs
 * Пишет в public/assets/: tree_spruce.svg, tree_leafy.svg.
 *
 * Холст 32×32 — как у дома (house_goal.svg), поэтому при том же размере на
 * экране (3×3 блока) пиксели деревьев и дома одинаковые. Низ ствола — на
 * последней строке холста: эта линия ставится на верх платформы.
 * Палитра — из дома и травы (gemini-svg.svg). Только <rect> с целыми
 * координатами, фон прозрачный. Генерация детерминированная.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SIZE = 32;
const OUT_DIR = fileURLToPath(new URL('../public/assets/', import.meta.url));

const C = {
  leafDark: '#005200',
  leaf: '#00A800',
  leafLight: '#5CDB5C',
  snow: '#FFFFFF',
  snowShade: '#D8E2EC',
  barkDark: '#3D210D',
  bark: '#6A3818',
  barkLight: '#87481F',
  apple: '#E63946',
  appleLight: '#FF8A80',
};

function createGrid() {
  return Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
}

function put(grid, x, y, color) {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y][x] = color;
}

/** Сетка → SVG: горизонтальные отрезки одного цвета сливаются в один <rect>. */
function gridToSvg(grid, comment) {
  const rects = [];
  for (let y = 0; y < SIZE; y++) {
    let x = 0;
    while (x < SIZE) {
      const color = grid[y][x];
      if (!color) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < SIZE && grid[y][end] === color) end++;
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`);
      x = end;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" shape-rendering="crispEdges">`,
    `<!-- ${comment}. Сгенерировано scripts/generate-trees.mjs, не править руками. -->`,
    ...rects,
    '</svg>',
    '',
  ].join('\n');
}

/** Ствол: светлый левый край, тёмный правый, у земли расширение-корни. */
function drawTrunk(grid, top, left, width) {
  for (let y = top; y < SIZE; y++) {
    for (let x = left; x < left + width; x++) {
      const color = x === left ? C.barkLight : x === left + width - 1 ? C.barkDark : C.bark;
      put(grid, x, y, color);
    }
  }
  // Корни в последней строке.
  put(grid, left - 1, SIZE - 1, C.bark);
  put(grid, left + width, SIZE - 1, C.barkDark);
}

/**
 * Ель: три яруса-треугольника, нижние рисуются первыми, верхние
 * перекрывают их. Свет слева: левая часть яруса светлая, правая тёмная.
 * По нижней кромке яруса — снег, свисающий «зубцами».
 */
function generateSpruce() {
  const grid = createGrid();
  const cx = 16; // ось между столбцами 15 и 16
  drawTrunk(grid, 26, 14, 4);

  const tiers = [
    { top: 15, bottom: 26, wTop: 3, wBot: 12 },
    { top: 8, bottom: 18, wTop: 2, wBot: 9 },
    { top: 2, bottom: 10, wTop: 1, wBot: 6 },
  ];
  for (const { top, bottom, wTop, wBot } of tiers) {
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / (bottom - top);
      const w = Math.round(wTop + t * (wBot - wTop));
      const left = cx - w;
      const right = cx + w - 1;
      for (let x = left; x <= right; x++) {
        const rel = (x - left + 0.5) / (2 * w);
        let color = rel < 0.3 ? C.leafLight : rel < 0.62 ? C.leaf : C.leafDark;
        // Шахматный переход между тонами — фактура хвои.
        if (rel >= 0.25 && rel < 0.35 && (x + y) % 2 === 0) color = C.leaf;
        if (rel >= 0.57 && rel < 0.67 && (x + y) % 2 === 0) color = C.leafDark;
        put(grid, x, y, color);
      }
      if (y === bottom) {
        // Снежная кромка: зубцы через пиксель, слева белая, справа в тени.
        // Снежная кромка: сплошная полоса, слева белая, справа в тени,
        // ниже — редкие «сосульки» снега.
        for (let x = left - 1; x <= right + 1; x++) put(grid, x, y, x >= cx + 2 ? C.snowShade : C.snow);
        for (let x = left + 1; x <= right; x += 4) put(grid, x, y + 1, x >= cx + 2 ? C.snowShade : C.snow);
      } else if (y === bottom - 1) {
        put(grid, left, y, C.snow);
        put(grid, left + 1, y, C.snow);
        put(grid, right, y, C.snowShade);
      }
    }
  }
  // Снежная шапка на макушке.
  put(grid, 15, 1, C.snow);
  put(grid, 16, 1, C.snowShade);
  put(grid, 15, 2, C.snow);
  put(grid, 16, 2, C.snowShade);
  return grid;
}

/**
 * Лиственное дерево: крона из нескольких кругов, освещённая слева сверху,
 * с тёмной кромкой снизу-справа, лёгким снегом на макушке и яблоками.
 */
function generateLeafy() {
  const grid = createGrid();
  drawTrunk(grid, 18, 14, 4);
  // Ветки, уходящие в крону.
  put(grid, 13, 19, C.bark);
  put(grid, 12, 18, C.bark);
  put(grid, 18, 20, C.barkDark);
  put(grid, 19, 19, C.barkDark);

  const blobs = [
    { x: 16, y: 10, r: 7.5 },
    { x: 9.5, y: 14, r: 5.5 },
    { x: 22.5, y: 14, r: 5.5 },
    { x: 13, y: 17, r: 4.5 },
    { x: 20, y: 17.5, r: 4 },
  ];
  const inside = (x, y) => blobs.some((b) => (x + 0.5 - b.x) ** 2 + (y + 0.5 - b.y) ** 2 <= b.r * b.r);
  const light = { x: -0.62, y: -0.78 };

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!inside(x, y)) continue;
      // Свет считаем по кругу, в который пиксель входит глубже всего.
      let best = null;
      let bestDepth = -Infinity;
      for (const b of blobs) {
        const dx = x + 0.5 - b.x;
        const dy = y + 0.5 - b.y;
        const depth = b.r - Math.hypot(dx, dy);
        if (depth > bestDepth) {
          bestDepth = depth;
          best = { nx: dx / b.r, ny: dy / b.r };
        }
      }
      const lit = best.nx * light.x + best.ny * light.y;
      let color = lit > 0.35 ? C.leafLight : lit < -0.25 ? C.leafDark : C.leaf;
      if (Math.abs(lit - 0.35) < 0.12 && (x + y) % 2 === 0) color = C.leaf;
      if (Math.abs(lit + 0.25) < 0.12 && (x + y) % 2 === 0) color = C.leafDark;
      // Кромка у пустоты снизу и справа — тёмная, чтобы крона читалась.
      const edgeBelow = !inside(x, y + 1) || !inside(x + 1, y);
      if (edgeBelow && lit < 0.2) color = C.leafDark;
      put(grid, x, y, color);
    }
  }

  // Лёгкий снег: верхний пиксель кроны в столбцах у макушки.
  for (let x = 10; x <= 22; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (!inside(x, y)) continue;
      put(grid, x, y, x <= 16 ? C.snow : C.snowShade);
      break;
    }
  }

  // Яблоки: красная точка с бликом сверху-слева.
  for (const [x, y] of [[12, 9], [19, 12], [8, 15], [23, 16], [15, 15]]) {
    put(grid, x, y, C.apple);
    put(grid, x + 1, y, C.apple);
    put(grid, x, y + 1, C.apple);
    put(grid, x + 1, y + 1, C.apple);
    put(grid, x, y, C.appleLight);
  }
  return grid;
}

writeFileSync(OUT_DIR + 'tree_spruce.svg', gridToSvg(generateSpruce(), 'Ель в снегу, 32×32'));
writeFileSync(OUT_DIR + 'tree_leafy.svg', gridToSvg(generateLeafy(), 'Лиственное дерево с яблоками, 32×32'));
console.log('tree_spruce.svg, tree_leafy.svg записаны в', OUT_DIR);
