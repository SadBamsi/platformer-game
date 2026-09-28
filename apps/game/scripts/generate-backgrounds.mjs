#!/usr/bin/env node
/**
 * Генератор пиксель-арт фона (SVG) для параллакса: звёзды и два слоя облаков.
 *
 * Запуск из apps/game:  node scripts/generate-backgrounds.mjs
 * Пишет в public/assets/: bg_stars.svg, bg_clouds_far.svg, bg_clouds_near.svg.
 *
 * Каждый файл — плитка TILE×TILE единиц, 1 единица = 1 пиксель рисунка.
 * Плитки бесшовные по обеим осям: ничего не касается краёв (отступ MARGIN),
 * поэтому ParallaxBackground повторяет их и по вертикали, и по горизонтали.
 * Только <rect> с целыми координатами, горизонтальные отрезки одного цвета
 * слиты в один прямоугольник. Фон прозрачный.
 *
 * Генерация детерминированная (seed), повторный запуск даёт те же файлы.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TILE = 256;
const MARGIN = 4;
const OUT_DIR = fileURLToPath(new URL('../public/assets/', import.meta.url));

/** mulberry32 — тот же PRNG, что в src/game/rising/random.ts. */
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Пустой холст: grid[y][x] = цвет или null. */
function createGrid() {
  return Array.from({ length: TILE }, () => new Array(TILE).fill(null));
}

/** Сетка → SVG: горизонтальные отрезки одного цвета сливаются в один <rect>. */
function gridToSvg(grid, comment) {
  const rects = [];
  for (let y = 0; y < TILE; y++) {
    let x = 0;
    while (x < TILE) {
      const color = grid[y][x];
      if (!color) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < TILE && grid[y][end] === color) end++;
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`);
      x = end;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}" width="${TILE}" height="${TILE}" shape-rendering="crispEdges">`,
    `<!-- ${comment}. Сгенерировано scripts/generate-backgrounds.mjs, не править руками. -->`,
    ...rects,
    '</svg>',
    '',
  ].join('\n');
}

/**
 * Форма облака: основание со скруглёнными концами и над ним несколько
 * круглых «клубов» разного размера. Для каждого столбца берём самую высокую
 * точку из основания и клубов, ниже — всё заполнено до плоского низа.
 * Возвращает маску mask[y][x] (true — облако) размером w×h.
 */
function cloudMask(rng, w, h) {
  const mask = Array.from({ length: h }, () => new Array(w).fill(false));
  const baseH = Math.max(4, Math.round(h * 0.38));
  const baseTop = h - baseH;
  const endR = baseH / 2;
  // Центры клубов — у верха основания, чтобы клуб «вырастал» из него.
  const centerY = baseTop + 1;
  // Клубы заметно разного размера: большой в середине, меньше по бокам.
  // Одинаковые клубы сливаются в один купол, а между разными видны впадины.
  const jitter = () => (rng() - 0.5) * 0.06;
  const bumps = [
    { t: 0.5 + jitter(), k: 0.92 + rng() * 0.08 },
    { t: 0.27 + jitter(), k: 0.55 + rng() * 0.15 },
    { t: 0.73 + jitter(), k: 0.62 + rng() * 0.15 },
  ];
  if (rng() < 0.6) bumps.push({ t: rng() < 0.5 ? 0.13 : 0.87, k: 0.38 + rng() * 0.1 });
  const puffs = bumps.map(({ t, k }) => ({ cx: w * t, r: centerY * k }));
  for (let x = 0; x < w; x++) {
    const px = x + 0.5;
    let top = Infinity;
    // Основание: прямоугольник со скруглёнными концами (полукруги радиуса endR).
    if (px >= endR && px <= w - endR) top = baseTop;
    else {
      const dx = px < endR ? endR - px : px - (w - endR);
      if (dx < endR) top = baseTop + endR - Math.sqrt(endR * endR - dx * dx);
    }
    for (const { cx, r } of puffs) {
      const dx = px - cx;
      if (Math.abs(dx) < r) top = Math.min(top, centerY - Math.sqrt(r * r - dx * dx));
    }
    if (!Number.isFinite(top)) continue;
    for (let y = Math.max(0, Math.round(top)); y < h; y++) mask[y][x] = true;
  }
  return mask;
}

/**
 * Раскраска облака по маске: светлая кромка сверху (над пикселем пусто),
 * тень в нижних рядах и по нижней кромке, остальное — тело.
 */
function paintCloud(grid, mask, ox, oy, palette) {
  const h = mask.length;
  const w = mask[0].length;
  const filled = (x, y) => y >= 0 && y < h && x >= 0 && x < w && mask[y][x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y][x]) continue;
      let color = palette.body;
      if (y >= h - 2) color = palette.shadow;
      else if (y >= h - 4) color = palette.lowBody;
      // Светлая кромка сверху: сам край (rim) и два пикселя под ним (light),
      // луна светит сверху. Боковые края клубов тоже подсвечены.
      if (!filled(x, y - 1)) color = palette.rim;
      else if (!filled(x, y - 2) || !filled(x, y - 3)) color = palette.light;
      else if (y < h - 2 && (!filled(x - 1, y) || !filled(x + 1, y))) color = palette.light;
      grid[oy + y][ox + x] = color;
    }
  }
}

/**
 * Раскладывает облака в плитке без пересечений (с зазором) и без касания
 * краёв. Позиции подбираются случайно с ограничением попыток.
 */
function placeClouds(rng, specs, palette) {
  const grid = createGrid();
  const boxes = [];
  const gap = 10;
  for (const spec of specs) {
    const mask = cloudMask(rng, spec.w, spec.h);
    for (let attempt = 0; attempt < 500; attempt++) {
      const xMin = spec.xRange ? spec.xRange[0] : MARGIN;
      const xMax = (spec.xRange ? spec.xRange[1] : TILE - MARGIN) - spec.w;
      const x = Math.round(xMin + rng() * Math.max(0, xMax - xMin));
      const y = Math.round(MARGIN + rng() * (TILE - 2 * MARGIN - spec.h));
      const clash = boxes.some(
        (b) => x < b.x + b.w + gap && x + spec.w + gap > b.x && y < b.y + b.h + gap && y + spec.h + gap > b.y,
      );
      if (clash) continue;
      boxes.push({ x, y, w: spec.w, h: spec.h });
      paintCloud(grid, mask, x, y, palette);
      break;
    }
  }
  return grid;
}

function generateStars() {
  const rng = createRng(1001);
  const grid = createGrid();
  const put = (x, y, c) => {
    if (x >= MARGIN && x < TILE - MARGIN && y >= MARGIN && y < TILE - MARGIN) grid[y][x] = c;
  };
  const occupied = [];
  const free = (x, y, r) => occupied.every((p) => Math.abs(p[0] - x) > r || Math.abs(p[1] - y) > r);
  const pick = (r) => {
    for (let i = 0; i < 200; i++) {
      const x = MARGIN + 3 + Math.floor(rng() * (TILE - 2 * MARGIN - 6));
      const y = MARGIN + 3 + Math.floor(rng() * (TILE - 2 * MARGIN - 6));
      if (free(x, y, r)) {
        occupied.push([x, y]);
        return [x, y];
      }
    }
    return null;
  };
  // Тусклые и средние одиночные звёзды.
  for (let i = 0; i < 90; i++) {
    const p = pick(5);
    if (p) put(p[0], p[1], rng() < 0.65 ? '#4a548a' : '#7d88c4');
  }
  // Яркие одиночные.
  for (let i = 0; i < 18; i++) {
    const p = pick(6);
    if (p) put(p[0], p[1], '#c9d1ff');
  }
  // Звёзды-крестики 3×3.
  for (let i = 0; i < 7; i++) {
    const p = pick(12);
    if (!p) continue;
    const [x, y] = p;
    put(x, y, '#ffffff');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, '#8f9ad6');
  }
  // Крупные мерцающие звёзды 5×5 с лучами.
  for (let i = 0; i < 2; i++) {
    const p = pick(20);
    if (!p) continue;
    const [x, y] = p;
    put(x, y, '#ffffff');
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, '#dfe4ff');
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) put(x + dx, y + dy, '#6f7ab8');
  }
  return grid;
}

function generateFarClouds() {
  const rng = createRng(2002);
  const specs = [
    { w: 60, h: 22 },
    { w: 46, h: 18 },
    { w: 38, h: 15 },
    { w: 68, h: 24 },
    { w: 32, h: 13 },
  ];
  return placeClouds(rng, specs, {
    rim: '#5c669e',
    light: '#4a5488',
    body: '#3c4574',
    lowBody: '#343c66',
    shadow: '#2a3158',
  });
}

function generateNearClouds() {
  const rng = createRng(3003);
  // Ближние облака — только у краёв плитки: центр экрана остаётся для игры.
  const specs = [
    { w: 40, h: 16, xRange: [MARGIN, 64] },
    { w: 34, h: 14, xRange: [TILE - 64, TILE - MARGIN] },
    { w: 28, h: 12, xRange: [MARGIN, 56] },
  ];
  return placeClouds(rng, specs, {
    rim: '#9aa3d2',
    light: '#7f89bf',
    body: '#6771a8',
    lowBody: '#5a6499',
    shadow: '#4b5487',
  });
}

const outputs = [
  ['bg_stars.svg', generateStars(), 'Звёзды, прозрачный фон'],
  ['bg_clouds_far.svg', generateFarClouds(), 'Дальние облака'],
  ['bg_clouds_near.svg', generateNearClouds(), 'Ближние облака у краёв'],
];
for (const [name, grid, comment] of outputs) {
  const svg = gridToSvg(grid, comment);
  writeFileSync(OUT_DIR + name, svg);
  const rects = (svg.match(/<rect/g) ?? []).length;
  console.log(`${name}: ${TILE}×${TILE}, ${rects} rect, ${(svg.length / 1024).toFixed(1)} КБ`);
}
