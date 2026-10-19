#!/usr/bin/env node
/**
 * Генератор пиксель-арт врагов-лесунов (SVG) — варианты на выбор.
 *
 * Запуск из apps/game:  node scripts/generate-enemies.mjs
 * Пишет в public/assets/: enemy_stump.svg, enemy_moss.svg, enemy_roots.svg
 * (листы по 2 кадра 32×32) и enemy_leshy.svg (32×48, пока не используется).
 *
 * Плотность пикселей — как у девочки (sprite.svg: 32 пикселя на блок),
 * стиль тот же: плоские цвета без обводки, свет слева. Ноги — на нижней
 * строке холста. Холст 32×32 (1×1 блок), у высокого лесавика 32×48 (как
 * кадр девочки). Смотрят влево — к игроку, идущему слева направо, рисуем
 * зеркально в игре.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/assets/', import.meta.url));

const C = {
  barkDeep: '#2B1A10',
  barkDark: '#3E2723',
  bark: '#5D4037',
  barkMid: '#8B5A2B',
  barkLight: '#A06832',
  ring: '#D9A066',
  ringDark: '#B87D43',
  mossDark: '#005200',
  moss: '#00A800',
  mossLight: '#5CDB5C',
  lichen: '#9CCC65',
  lichenLight: '#DCEDC8',
  hollow: '#140A05',
  glow: '#FFE066',
  glowDim: '#FFB703',
  eyeWhite: '#FFFFFF',
  pupil: '#1B1B1B',
  mushroom: '#E63946',
  spot: '#FFFFFF',
};

/**
 * Холст с переносом: ox — сдвиг кадра в листе, oy — покачивание корпуса
 * между кадрами ходьбы. shape() работает в координатах кадра.
 */
function createCanvas(w, h) {
  const grid = Array.from({ length: h }, () => new Array(w).fill(null));
  const canvas = {
    grid,
    w,
    h,
    ox: 0,
    oy: 0,
    frameW: w,
    put(x, y, color) {
      const gx = x + canvas.ox;
      const gy = y + canvas.oy;
      if (x >= 0 && x < canvas.frameW && gx < w && gy >= 0 && gy < h) grid[gy][gx] = color;
    },
    rect(x, y, rw, rh, color) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) canvas.put(xx, yy, color);
    },
    points(list, color) {
      for (const [x, y] of list) canvas.put(x, y, color);
    },
    /** Закрашивает клетки кадра, для которых inside(x+0.5, y+0.5) истинно, цветом shade(x, y). */
    shape(inside, shade) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < canvas.frameW; x++) if (inside(x + 0.5, y + 0.5)) canvas.put(x, y, shade(x, y));
      }
    },
  };
  return canvas;
}

/**
 * Лист кадров ходьбы: кадры 32×h слева направо. Кадр 1 — шаг: корпус
 * приподнят на пиксель, ноги в другой фазе (рисует draw по номеру кадра).
 */
function sheet(frameH, frames, draw) {
  const c = createCanvas(32 * frames, frameH);
  c.frameW = 32;
  for (let f = 0; f < frames; f++) {
    c.ox = 32 * f;
    draw(c, f);
  }
  c.ox = 0;
  c.oy = 0;
  return c;
}

function toSvg({ grid, w, h }, comment) {
  const rects = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const color = grid[y][x];
      if (!color) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < w && grid[y][end] === color) end++;
      rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`);
      x = end;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">`,
    `<!-- ${comment}. Сгенерировано scripts/generate-enemies.mjs, не править руками. -->`,
    ...rects,
    '</svg>',
    '',
  ].join('\n');
}

/** Светящийся глаз в тёмном дупле: дупло 3×3, в центре свет, под ним отблеск. */
function hollowEye(c, x, y) {
  c.rect(x, y, 3, 3, C.hollow);
  c.put(x + 1, y + 1, C.glow);
  c.put(x + 1, y + 2, C.glowDim);
}

/**
 * А. Пнявік — ходячий пень: срез с кольцами, мох на макушке, глаза-дупла,
 * рот-трещина, руки-сучки с листиками, ноги-корни.
 */
function stump(c, f) {
  // Ноги-корни: в кадре шага левая нога поднята.
  c.oy = 0;
  const lift = f === 1 ? 1 : 0;
  c.rect(10, 27 - lift, 4, 4, C.bark);
  c.rect(18, 27, 4, 4, C.barkDark);
  c.put(10, 27 - lift, C.barkMid);
  c.rect(8, 31 - lift, 6, 1, C.barkDark);
  c.rect(18, 31, 6, 1, C.barkDeep);
  c.oy = -f; // корпус подпрыгивает на шаге
  // Тело-ствол: свет слева, тень справа, продольные борозды коры.
  for (let y = 10; y < 28; y++) {
    for (let x = 9; x <= 22; x++) {
      let color = x === 9 ? C.barkLight : x >= 21 ? C.barkDark : x >= 19 ? C.bark : C.barkMid;
      if ((x === 12 || x === 17) && y % 3 !== 0) color = C.bark;
      if (x === 20 && y % 2 === 0) color = C.barkDark;
      c.put(x, y, color);
    }
  }
  // Срез с годовыми кольцами.
  c.rect(10, 7, 12, 1, C.ring);
  c.rect(9, 8, 14, 2, C.ring);
  c.rect(11, 8, 10, 1, C.ringDark);
  c.rect(12, 9, 8, 1, C.ring);
  c.points([[11, 9], [20, 9], [15, 9], [16, 9]], C.ringDark);
  c.rect(10, 10, 12, 1, C.ringDark);
  // Мох на макушке, свисает слева.
  c.points([[10, 6], [11, 6], [13, 5], [14, 6], [12, 6], [9, 7], [9, 8], [9, 9], [9, 10], [9, 11], [10, 7]], C.moss);
  c.points([[11, 5], [12, 5], [13, 6], [10, 8], [9, 12]], C.mossLight);
  c.points([[15, 6], [9, 13], [8, 9]], C.mossDark);
  // Глаза и рот.
  hollowEye(c, 11, 13);
  hollowEye(c, 17, 13);
  c.points([[11, 12], [12, 12], [13, 12]], C.barkDark); // нахмуренная бровь
  c.points([[17, 12], [18, 12], [19, 12]], C.barkDark);
  c.points([[12, 20], [13, 21], [14, 20], [15, 21], [16, 20], [17, 21], [18, 20]], C.hollow);
  c.points([[13, 20], [15, 20], [17, 20]], C.ring); // зубы-щепки
  // Руки-сучки.
  c.points([[8, 18], [7, 17], [6, 16], [5, 15], [5, 14], [4, 16], [3, 16]], C.bark);
  c.points([[23, 18], [24, 17], [25, 16], [26, 15], [26, 14], [27, 16], [28, 16]], C.barkDark);
  c.points([[5, 13], [4, 12], [2, 16], [26, 13], [27, 12], [29, 16]], C.moss);
  c.points([[6, 13], [28, 12]], C.mossLight);
  // Грибок на боку.
  c.rect(21, 23, 3, 1, C.mushroom);
  c.put(22, 23, C.spot);
  c.put(22, 24, C.ring);
}

/**
 * Б. Лесавік — высокий лесной дед: ветви-рога, лицо из коры с длинным
 * носом, горящие глаза, борода из лишайника до колен, моховой кафтан,
 * длинные руки-ветки, ноги-палки.
 */
function leshy() {
  const c = createCanvas(32, 48);
  // Ноги-палки.
  c.rect(13, 40, 2, 7, C.bark);
  c.rect(18, 40, 2, 7, C.barkDark);
  c.rect(11, 47, 4, 1, C.barkDark);
  c.rect(18, 47, 4, 1, C.barkDeep);
  // Моховой кафтан: трапеция, расширяется книзу, листовая фактура.
  c.shape(
    (x, y) => {
      if (y < 22 || y > 41) return false;
      const half = 6 + (y - 22) * 0.2;
      return Math.abs(x - 16) <= half;
    },
    (x, y) => {
      const rel = (x - 9) / 14;
      let color = rel < 0.3 ? C.mossLight : rel < 0.7 ? C.moss : C.mossDark;
      if ((x * 3 + y * 5) % 7 === 0) color = rel < 0.5 ? C.moss : C.mossDark;
      if (y === 41 && x % 2 === 0) return C.mossDark; // рваный подол
      return color;
    },
  );
  // Длинные руки-ветки до колен, пальцы-сучки.
  for (let y = 23; y <= 34; y++) {
    const out = Math.floor((y - 23) / 6);
    c.put(8 - out, y, C.barkMid);
    c.put(9 - out, y, C.bark);
    c.put(22 + out, y, C.bark);
    c.put(23 + out, y, C.barkDark);
  }
  c.points([[5, 35], [6, 36], [7, 35], [6, 37]], C.bark);
  c.points([[26, 35], [25, 36], [24, 35], [25, 37]], C.barkDark);
  // Голова из коры.
  c.shape(
    (x, y) => y >= 9 && y <= 21 && Math.abs(x - 16) <= (y < 11 ? 4 : 5),
    (x) => (x <= 12 ? C.barkLight : x >= 19 ? C.bark : C.barkMid),
  );
  // Брови-наросты и горящие глаза.
  c.points([[12, 13], [13, 13], [14, 14], [18, 14], [19, 13], [20, 13]], C.barkDark);
  c.points([[13, 15], [14, 15], [18, 15], [19, 15]], C.hollow);
  c.points([[13, 15], [19, 15]], C.glow);
  // Длинный нос-сучок.
  c.points([[16, 15], [16, 16], [16, 17], [15, 18], [14, 18]], C.barkLight);
  c.points([[17, 16], [17, 17]], C.bark);
  // Борода из лишайника: от щёк до колен, сужается.
  c.shape(
    // Рваный низ: пряди разной длины.
    (x, y) => y >= 19 && y <= 34 + (x % 3) && Math.abs(x - 16) <= 5 - (y - 19) * 0.22,
    // Вертикальные пряди: светлые слева, в тени справа.
    (x) => (x <= 13 ? C.lichenLight : x >= 18 ? C.lichen : x % 2 === 0 ? C.lichenLight : C.lichen),
  );
  c.points([[15, 19], [16, 19], [17, 19]], C.hollow); // рот в бороде
  // Ветви-рога.
  const antlers = [
    [12, 8], [12, 7], [11, 6], [11, 5], [10, 4], [10, 3], [9, 2], [12, 5], [13, 4], [13, 3], [9, 5], [8, 4],
  ];
  c.points(antlers, C.barkMid);
  c.points(antlers.map(([x, y]) => [31 - x, y]), C.bark);
  c.points([[9, 1], [8, 2], [13, 2], [7, 4], [22, 1], [23, 2], [18, 2], [24, 4]], C.moss);
  c.points([[8, 1], [14, 2], [23, 1]], C.mossLight);
  return c;
}

/**
 * В. Махнач — сердитый моховой ком: круглый куст с листьями, большие
 * глаза с нахмуренными бровями, маленькие ножки, сучок с листиком на макушке.
 */
function moss(c, f) {
  c.oy = 0;
  const lift = f === 1 ? 1 : 0;
  c.rect(12, 28 - lift, 3, 3, C.bark);
  c.rect(18, 28, 3, 3, C.barkDark);
  c.rect(11, 31 - lift, 4, 1, C.barkDark);
  c.rect(18, 31, 4, 1, C.barkDeep);
  c.oy = -f;
  const cx = 16;
  const cy = 19.5;
  const r = 9.5;
  c.shape(
    (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
    (x, y) => {
      const lit = (-(x + 0.5 - cx) * 0.6 - (y + 0.5 - cy) * 0.8) / r;
      let color = lit > 0.35 ? C.mossLight : lit < -0.3 ? C.mossDark : C.moss;
      if (Math.abs(lit - 0.35) < 0.1 && (x + y) % 2 === 0) color = C.moss;
      if (Math.abs(lit + 0.3) < 0.1 && (x + y) % 2 === 0) color = C.mossDark;
      return color;
    },
  );
  // Листья торчат по краю.
  c.points([[6, 14], [5, 13], [26, 15], [27, 14], [8, 26], [24, 27], [13, 10], [20, 10]], C.moss);
  c.points([[5, 12], [28, 13], [12, 9]], C.mossLight);
  // Сучок с листиком на макушке.
  c.points([[16, 9], [16, 8], [17, 7]], C.bark);
  c.points([[18, 6], [18, 7], [19, 6]], C.mossLight);
  // Глаза: белки 3×4, зрачки смотрят влево.
  c.rect(11, 16, 3, 4, C.eyeWhite);
  c.rect(18, 16, 3, 4, C.eyeWhite);
  c.rect(11, 17, 2, 2, C.pupil);
  c.rect(18, 17, 2, 2, C.pupil);
  // Сердитые брови.
  c.points([[10, 14], [11, 14], [12, 15], [13, 15]], C.hollow);
  c.points([[18, 15], [19, 15], [20, 14], [21, 14]], C.hollow);
  // Рот.
  c.rect(14, 23, 4, 1, C.hollow);
  c.points([[13, 22], [18, 22]], C.hollow);
}

/**
 * Г. Карчок — летающий дух из корней: круглое тело из переплетённых
 * корней с огромными светящимися глазами, ушки-сучки как у совы, снизу
 * свисают корни-щупальца. Летает, поэтому ноги ему не нужны.
 */
function roots(c, f) {
  c.oy = -f; // парит: во втором кадре чуть выше
  const cx = 16;
  const cy = 12.5;
  const r = 8;
  c.shape(
    (x, y) => (x - cx) ** 2 + ((y - cy) * 1.1) ** 2 <= r * r,
    (x, y) => {
      const lit = (-(x + 0.5 - cx) * 0.6 - (y + 0.5 - cy) * 0.8) / r;
      let color = lit > 0.3 ? C.barkLight : lit < -0.3 ? C.bark : C.barkMid;
      // Переплетение: диагональные тёмные жилы.
      if ((x + y) % 5 === 0 || (x - y + 40) % 7 === 0) color = lit > 0.3 ? C.barkMid : C.barkDark;
      return color;
    },
  );
  // Ушки-сучки.
  c.points([[10, 5], [9, 4], [9, 3], [8, 2]], C.barkMid);
  c.points([[22, 5], [23, 4], [23, 3], [24, 2]], C.bark);
  c.points([[7, 2], [25, 2]], C.moss);
  // Огромные светящиеся глаза.
  c.rect(10, 10, 5, 5, C.hollow);
  c.rect(18, 10, 5, 5, C.hollow);
  c.rect(11, 11, 3, 3, C.glowDim);
  c.rect(19, 11, 3, 3, C.glowDim);
  c.points([[11, 11], [12, 11], [19, 11], [20, 11]], C.glow);
  c.points([[12, 12], [20, 12]], C.hollow); // зрачки
  // Клюв-сучок.
  c.points([[16, 14], [16, 15]], C.ringDark);
  // Корни-щупальца, волнистые.
  const tendril = (x0, len, phase, color) => {
    for (let i = 0; i < len; i++) c.put(x0 + Math.round(Math.sin((i + phase) * 0.9)), 20 + i, color);
  };
  // Во втором кадре волна по щупальцам сдвинута — они шевелятся.
  const phase = f * 2;
  tendril(11, 9, 0 + phase, C.barkMid);
  tendril(14, 11, 2 + phase, C.bark);
  tendril(18, 10, 1 + phase, C.bark);
  tendril(21, 8, 3 + phase, C.barkDark);
  // Искры вокруг — лесная магия.
  c.points([[5, 9], [27, 13], [6, 19], [26, 22]], C.mossLight);
  c.points([[4, 9], [5, 8], [27, 12], [28, 13]], C.moss);
}

/** Кадров ходьбы/полёта в листе. Лист — ENEMY_FRAMES кадров 32×32 слева направо. */
const ENEMY_FRAMES = 2;

const enemies = [
  ['enemy_stump.svg', sheet(32, ENEMY_FRAMES, stump), 'Пнявік — ходячий пень, 2 кадра шага'],
  // Лесавік пока не используется в игре (выбраны Пнявік, Махнач и Карчок).
  ['enemy_leshy.svg', leshy(), 'Лесавік — высокий лесной дед'],
  ['enemy_moss.svg', sheet(32, ENEMY_FRAMES, moss), 'Махнач — сердитый моховой ком, 2 кадра шага'],
  ['enemy_roots.svg', sheet(32, ENEMY_FRAMES, roots), 'Карчок — летающий дух из корней, 2 кадра полёта'],
];
for (const [file, canvas, comment] of enemies) {
  writeFileSync(OUT_DIR + file, toSvg(canvas, comment));
}
console.log(enemies.map(([file]) => file).join(', '), 'записаны в', OUT_DIR);
