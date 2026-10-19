/**
 * Враги-лесуны: где стоят и как двигаются. Чистый модуль без Phaser,
 * единицы сетки: x — блоки (растёт вправо), ряды — от земли вверх (как в
 * stageGenerator.ts).
 *
 * Правила (решение пользователя 29.09.2026):
 * - никто не бьёт игрока и не отнимает жизнь — враги только толкают и
 *   мешают подниматься: твёрдое тело, которое едет на игрока;
 * - на этапах 1–2 врагов нет;
 * - с этапа 3 — Пнявік на каждой третьей платформе пути: ходит по ней
 *   туда-сюда и сталкивает игрока с края;
 * - с этапа 7 — Махнач на каждой пятой платформе: ползёт по кругу вокруг
 *   платформы (сверху, по боку, снизу, по другому боку);
 * - на одной платформе только один вид: где по правилам выпадают оба,
 *   остаётся Махнач (он появляется позже и реже);
 * - с этапа 10 — Карчок между каждой третьей парой соседних платформ:
 *   летает по горизонтали на всю ширину мира, соседние Карчки — в разные
 *   стороны.
 *
 * Положение врага — функция времени (enemyPose), без накопленного
 * состояния: рестарт этапа и резиз окна дают ту же картину, а тесты
 * проверяют траектории без движка. Сцена только двигает физическое тело к
 * этой точке.
 *
 * Картинки: public/assets/enemy_*.svg (scripts/generate-enemies.mjs),
 * кадр 32×32 = 1×1 блок, смотрят влево. Хитбоксы ниже — в пикселях кадра.
 */
import { GRID_COLUMNS, PLAYER_HITBOX_WIDTH_BLOCKS } from '@/game/dimensions';
import type { PlatformSpec, Stage } from './stageGenerator';

export type EnemyKind = 'stump' | 'moss' | 'roots';

export const ENEMY_KINDS: readonly EnemyKind[] = ['stump', 'moss', 'roots'];

export const FIRST_STUMP_STAGE = 3;
export const FIRST_MOSS_STAGE = 7;
export const FIRST_ROOTS_STAGE = 10;
/** Пнявік — на платформах с номером i, где i % 3 === 2 (каждая третья). */
const STUMP_EVERY = 3;
/** Махнач — на каждой пятой платформе. */
const MOSS_EVERY = 5;
/** Карчок — между platforms[i] и platforms[i+1] для каждой третьей пары. */
const ROOTS_EVERY = 3;

/** Скорости, блок/с. Игрок бегает 6.875 блок/с — от любого врага можно уйти. */
export const ENEMY_SPEED_BLOCKS_PER_SEC: Record<EnemyKind, number> = {
  stump: 1.5,
  moss: 1.2,
  roots: 3,
};

/** Кадр картинки врага, пиксели (все враги — 32×32 = 1 блок). */
export const ENEMY_FRAME_PX = 32;

/**
 * Хитбокс в пикселях кадра: левый-верхний угол и размер. Симметричен
 * относительно вертикальной оси кадра, поэтому при отражении картинки
 * сдвигать его не нужно.
 * - Пнявік: ствол со срезом и ногами (без рук-сучков).
 * - Махнач: моховой шар (без ножек) — вокруг центра шара он вращается.
 * - Карчок: круглое тело (корни-щупальца проходимые).
 */
export const ENEMY_HITBOX_PX: Record<EnemyKind, { x: number; y: number; width: number; height: number }> = {
  stump: { x: 9, y: 7, width: 14, height: 25 },
  moss: { x: 7, y: 10, width: 18, height: 19 },
  roots: { x: 8, y: 5, width: 16, height: 15 },
};

/**
 * Точка привязки картинки (origin) = центр хитбокса в долях кадра. Тогда
 * позиция картинки совпадает с центром тела, и Махнач вращается вокруг
 * центра шара.
 */
export function enemyOrigin(kind: EnemyKind): { x: number; y: number } {
  const box = ENEMY_HITBOX_PX[kind];
  return {
    x: (box.x + box.width / 2) / ENEMY_FRAME_PX,
    y: (box.y + box.height / 2) / ENEMY_FRAME_PX,
  };
}

function halfSizeBlocks(kind: EnemyKind): { hw: number; hh: number } {
  const box = ENEMY_HITBOX_PX[kind];
  return { hw: box.width / 2 / ENEMY_FRAME_PX, hh: box.height / 2 / ENEMY_FRAME_PX };
}

/**
 * Зазор между врагом и стеной мира, в который помещается игрок: иначе враг
 * зажимает игрока в стену, и физика выталкивает его сквозь неё.
 */
const WALL_CLEARANCE_BLOCKS = PLAYER_HITBOX_WIDTH_BLOCKS + 0.15;

/**
 * Махнач: от центра шара до поверхности, по которой он ползёт, — низ ножек
 * в кадре (32) минус центр шара (19.5), в блоках.
 */
const MOSS_SURFACE_OFFSET = (ENEMY_FRAME_PX - (ENEMY_HITBOX_PX.moss.y + ENEMY_HITBOX_PX.moss.height / 2)) / ENEMY_FRAME_PX;
/** Рост игрока с запасом, ряды: столько свободного места нужно под Махначом. */
const PLAYER_ROOM_ROWS = 1.6;

export interface StumpEnemy {
  kind: 'stump';
  /** Ряд верха платформы, по которой ходит. */
  row: number;
  /** Пределы центра по x, блоки. */
  minX: number;
  maxX: number;
  /** Сдвиг по пути в начале этапа, блоки: враги не ходят синхронно. */
  phase: number;
}

export interface MossEnemy {
  kind: 'moss';
  platform: PlatformSpec;
  phase: number;
}

export interface RootsEnemy {
  kind: 'roots';
  /** Ряд центра полёта. */
  row: number;
  minX: number;
  maxX: number;
  /** Куда летит в начале этапа. */
  dir: 1 | -1;
  phase: number;
}

export type Enemy = StumpEnemy | MossEnemy | RootsEnemy;

export interface EnemyPose {
  /** Центр хитбокса: x в блоках, ряд от земли. */
  x: number;
  row: number;
  /** Смотрит вправо (картинку нужно отразить: нарисованы лицом влево). */
  facingRight: boolean;
  /** Поворот картинки по часовой стрелке, радианы (только у Махнача). */
  rotation: number;
}

interface Rect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;
}

function platformRect(p: PlatformSpec): Rect {
  return { left: p.x, right: p.x + p.width, bottom: p.row - 1, top: p.row };
}

/** Детерминированный сдвиг фазы: враги одного этапа не идут в ногу. */
function phaseFor(index: number, length: number): number {
  return (((index * 0.618034) % 1) + 1) % 1 * length;
}

/**
 * Насколько Пнявік доходит до края: центр — в STUMP_EDGE_INSET от края
 * платформы, то есть край ствола выступает за платформу. Если бы он
 * разворачивался, едва коснувшись края, игрок, которого он толкает,
 * оставался бы стоять на последнем пикселе и не падал (найдено тестом на
 * Arcade, 29.09.2026).
 */
const STUMP_EDGE_INSET = 0.05;

/** Пределы хода по платформе: доходит до самого края, но не зажимает игрока у стены. */
function stumpRange(p: PlatformSpec): { minX: number; maxX: number } {
  const { hw } = halfSizeBlocks('stump');
  let minX = p.x + STUMP_EDGE_INSET;
  let maxX = p.x + p.width - STUMP_EDGE_INSET;
  if (p.x <= 0) minX = Math.max(minX, WALL_CLEARANCE_BLOCKS + hw);
  if (p.x + p.width >= GRID_COLUMNS) maxX = Math.min(maxX, GRID_COLUMNS - WALL_CLEARANCE_BLOCKS - hw);
  return { minX, maxX };
}

/**
 * Махнач ползёт вокруг платформы, поэтому вокруг неё нужно свободное
 * место: ни одна платформа не должна попадать в полосу, по которой он
 * идёт, под платформой должен помещаться игрок (иначе Махнач прижмёт его
 * к нижней платформе), и путь не должен уходить за стены мира.
 */
function mossFits(p: PlatformSpec, others: readonly PlatformSpec[]): boolean {
  const band = MOSS_SURFACE_OFFSET * 2;
  if (p.x - band - WALL_CLEARANCE_BLOCKS < 0) return false;
  if (p.x + p.width + band + WALL_CLEARANCE_BLOCKS > GRID_COLUMNS) return false;
  const zone: Rect = {
    left: p.x - band,
    right: p.x + p.width + band,
    bottom: p.row - 1 - band - PLAYER_ROOM_ROWS,
    top: p.row + band,
  };
  return others.every((o) => o === p || !overlaps(zone, platformRect(o)));
}

/**
 * Все враги этапа. Порядок: сначала враги на платформах (по возрастанию
 * номера платформы), потом Карчки снизу вверх.
 */
export function placeEnemies(stage: Stage): Enemy[] {
  const n = stage.n;
  if (n < FIRST_STUMP_STAGE) return [];

  const exit: PlatformSpec = { x: stage.exit.x, row: stage.exit.row, width: stage.exit.width };
  const ground: PlatformSpec = { x: 0, row: 0, width: GRID_COLUMNS };
  const all = [ground, ...stage.platforms, exit];
  const enemies: Enemy[] = [];

  stage.platforms.forEach((p, i) => {
    const wantsMoss = n >= FIRST_MOSS_STAGE && i % MOSS_EVERY === MOSS_EVERY - 1;
    const wantsStump = i % STUMP_EVERY === STUMP_EVERY - 1;
    if (wantsMoss && mossFits(p, all)) {
      enemies.push({ kind: 'moss', platform: p, phase: phaseFor(i, mossPathLength(p)) });
      return;
    }
    // Платформа Махнача достаётся только ему, даже если он там не поместился:
    // правило «каждая пятая — Махнач» не должно превращаться в «Пнявік».
    if (wantsStump && !wantsMoss) {
      const { minX, maxX } = stumpRange(p);
      if (maxX > minX) enemies.push({ kind: 'stump', row: p.row, minX, maxX, phase: phaseFor(i, 2 * (maxX - minX)) });
    }
  });

  if (n >= FIRST_ROOTS_STAGE) {
    const { hw, hh } = halfSizeBlocks('roots');
    const minX = WALL_CLEARANCE_BLOCKS + hw;
    const maxX = GRID_COLUMNS - WALL_CLEARANCE_BLOCKS - hw;
    let count = 0;
    for (let i = ROOTS_EVERY - 2; i + 1 < stage.platforms.length; i += ROOTS_EVERY) {
      const a = stage.platforms[i]!;
      const b = stage.platforms[i + 1]!;
      // Посередине между верхом A и низом B.
      const row = (a.row + b.row - 1) / 2;
      const band: Rect = { left: 0, right: GRID_COLUMNS, bottom: row - hh, top: row + hh };
      if (all.some((p) => overlaps(band, platformRect(p)))) continue;
      enemies.push({
        kind: 'roots',
        row,
        minX,
        maxX,
        dir: count % 2 === 0 ? 1 : -1,
        phase: phaseFor(i, 2 * (maxX - minX)),
      });
      count += 1;
    }
  }

  return enemies;
}

/** Треугольная волна: 0 → range → 0 с периодом 2·range. */
function pingPong(distance: number, range: number): { offset: number; forward: boolean } {
  const period = 2 * range;
  const d = ((distance % period) + period) % period;
  return d <= range ? { offset: d, forward: true } : { offset: period - d, forward: false };
}

/** Длина пути Махнача вокруг платформы: четыре стороны и четыре дуги на углах. */
export function mossPathLength(p: PlatformSpec): number {
  return 2 * (p.width + 1) + 2 * Math.PI * MOSS_SURFACE_OFFSET;
}

/**
 * Точка на пути Махнача по часовой стрелке: по верху вправо, дуга вокруг
 * правого верхнего угла, вниз по правому боку, дуга, по низу влево, дуга,
 * вверх по левому боку, дуга. На дугах он плавно поворачивается — ногами
 * всегда к платформе.
 */
function mossPose(p: PlatformSpec, distance: number): EnemyPose {
  const d0 = MOSS_SURFACE_OFFSET;
  const arc = (Math.PI / 2) * d0;
  const top = p.row;
  const bottom = p.row - 1;
  const left = p.x;
  const right = p.x + p.width;
  const total = mossPathLength(p);
  let s = ((distance % total) + total) % total;

  // theta — направление нормали от платформы к Махначу (0 — вправо, π/2 — вверх).
  const at = (cx: number, cy: number, theta: number): EnemyPose => ({
    x: cx + d0 * Math.cos(theta),
    row: cy + d0 * Math.sin(theta),
    facingRight: true,
    rotation: Math.PI / 2 - theta,
  });

  const segments: Array<{ length: number; pose: (t: number) => EnemyPose }> = [
    { length: p.width, pose: (t) => at(left + t, top, Math.PI / 2) },
    { length: arc, pose: (t) => at(right, top, Math.PI / 2 - t / d0) },
    { length: 1, pose: (t) => at(right, top - t, 0) },
    { length: arc, pose: (t) => at(right, bottom, -t / d0) },
    { length: p.width, pose: (t) => at(right - t, bottom, -Math.PI / 2) },
    { length: arc, pose: (t) => at(left, bottom, -Math.PI / 2 - t / d0) },
    { length: 1, pose: (t) => at(left, bottom + t, -Math.PI) },
    { length: arc, pose: (t) => at(left, top, -Math.PI - t / d0) },
  ];
  for (const segment of segments) {
    if (s <= segment.length) return segment.pose(s);
    s -= segment.length;
  }
  return segments[0]!.pose(0);
}

/** Где враг через `seconds` секунд после начала этапа. */
export function enemyPose(enemy: Enemy, seconds: number): EnemyPose {
  const distance = enemy.phase + ENEMY_SPEED_BLOCKS_PER_SEC[enemy.kind] * seconds;
  switch (enemy.kind) {
    case 'stump': {
      const { hh } = halfSizeBlocks('stump');
      const { offset, forward } = pingPong(distance, enemy.maxX - enemy.minX);
      return { x: enemy.minX + offset, row: enemy.row + hh, facingRight: forward, rotation: 0 };
    }
    case 'moss':
      return mossPose(enemy.platform, distance);
    case 'roots': {
      const range = enemy.maxX - enemy.minX;
      const { offset, forward } = pingPong(distance, range);
      // dir = -1: тот же маятник, но из правого края влево.
      const x = enemy.dir === 1 ? enemy.minX + offset : enemy.maxX - offset;
      return { x, row: enemy.row, facingRight: enemy.dir === 1 ? forward : !forward, rotation: 0 };
    }
  }
}
