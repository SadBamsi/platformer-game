/**
 * Процедурный seeded-генератор этапов + валидатор проходимости. Чистый
 * модуль без Phaser. Правила — apps/game/docs/rising-water.md, раздел 4
 * (переходы A→B) и раздел 5 (параметры по этапам). Координаты — «ряды от
 * земли» (см. rising-water.md §1): row растёт вверх, row=0 — поверхность
 * земли. Перевод в пиксели Phaser (где y растёт вниз) — задача сцены
 * (PlatformerScene), не этого модуля.
 *
 * `PlatformSpec.row` — высота ВЕРХНЕЙ (ходибельной) поверхности платформы,
 * т.е. ровно `top(P)` из формул rising-water.md §4 (dy = B.row − A.row).
 */
import { GRID_COLUMNS } from '@/game/dimensions';
import { DY_MAX_ROWS, DY_MIN_ROWS, platformWidthBlocks, stageHeightRows } from './difficulty';
import { H_APEX_ROWS, safeReachRange } from './jumpReach';
import { canReach } from './jumpSimulator';
import { createRng, type Rng } from './random';

/** Ширина зоны разбега на земле у точки спавна/респауна (rising-water.md §4.1/§4.4). */
export const SPAWN_ZONE_WIDTH = 2;
/** Позиция левого края зоны спавна, блоки. Фиксирована близко к левому краю мира. */
export const SPAWN_X = 2;

/** Правило 4.1: минимальная ширина свободной от B части платформы A, блоки. */
const RUN_UP_ZONE_MIN_WIDTH = 2;
/** Правило 4.2a: потолок над B — top(B)..top(B)+2 (playerH+0.5=2 ряда), rising-water.md §4.2. */
const CEILING_OVER_B_ROWS = 1.5 + 0.5;
/** Правило 4.2b: коридор полёта A→B — top(A)..top(A)+5.5 (h_apex+0.5), rising-water.md §4.2. */
const FLIGHT_CORRIDOR_ROWS = H_APEX_ROWS + 0.5;
/**
 * Жёсткий физический предел на dy: при dy→h_apex окно дальности
 * [x_min,x_max] схлопывается в точку (rising-water.md §3.4). Небольшой
 * отступ от H_APEX_ROWS, чтобы не работать на грани деления/корня из нуля.
 */
const DY_HARD_MAX = H_APEX_ROWS - 0.1;
/** Высота зоны выхода в рядах (rising-water.md §5, «не выведено формулой»). */
const EXIT_ZONE_ROWS = 3;
/**
 * Запас под потолком мира. Верхняя граница мира (физика и камера) проходит
 * на ряду H−1: земля занимает последний Phaser-ряд, а мир высотой ровно H
 * рядов. Раньше выход ставился в ряды [H−3, H−1], то есть прямо в потолок:
 * игрок ростом 1.5 там не помещался, а в прыжке к выходу бился о границу мира
 * головой (баг «верхние платформы недостижимы», 24.09.2026). Над выходом
 * должно помещаться: прыжок к нему (апекс ≈ h_apex над A, A ниже выхода
 * минимум на DY_MIN_ROWS) плюс рост игрока плюс запас.
 */
const TOP_HEADROOM_ROWS = Math.ceil(H_APEX_ROWS - DY_MIN_ROWS + 1.5 + 0.5);

/** Самый высокий допустимый верх платформы выхода. */
export function exitZoneMaxRow(heightRows: number): number {
  return heightRows - 1 - TOP_HEADROOM_ROWS;
}

/** Самый низкий допустимый верх платформы выхода. */
export function exitZoneMinRow(heightRows: number): number {
  return exitZoneMaxRow(heightRows) - (EXIT_ZONE_ROWS - 1);
}

/**
 * Верхняя граница мира как препятствие для симуляции прыжка: «платформа»
 * во всю ширину, низ которой — ряд H−1.
 */
function worldCeiling(heightRows: number): PlatformSpec {
  return { x: -1, row: heightRows, width: GRID_COLUMNS + 2 };
}

export interface PlatformSpec {
  /** Левый край платформы, блоки, x ∈ [0, GRID_COLUMNS). */
  x: number;
  /** top(P) — высота ходибельной поверхности платформы, ряд от земли. */
  row: number;
  /** Ширина платформы, блоки. */
  width: number;
}

export interface Stage {
  /** Номер этапа (тот же, что и seed генератора). */
  n: number;
  /** H(n), ряды. */
  heightRows: number;
  /** width(n), блоки — ширина всех обычных платформ этого этапа. */
  platformWidth: number;
  /** Путь снизу вверх, БЕЗ земли и БЕЗ выхода (они — отдельные поля). */
  platforms: PlatformSpec[];
  spawn: { x: number };
  exit: { x: number; row: number; width: number };
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

function overlapLength(x1: number, w1: number, x2: number, w2: number): number {
  return Math.max(0, Math.min(x1 + w1, x2 + w2) - Math.max(x1, x2));
}

function rangesOverlap(x1: number, w1: number, x2: number, w2: number): boolean {
  return overlapLength(x1, w1, x2, w2) > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Проверяет один переход A→B против правил 4.1–4.3 (rising-water.md §4).
 * Правило 4.4 (спавн) сводится к этому же переходу с A = виртуальная зона
 * разбега на земле (см. validateStage).
 * `others` — все остальные платформы этапа (кроме A и B), которые могут
 * нависать потолком/перекрывать коридор полёта.
 */
function checkTransition(
  A: PlatformSpec,
  B: PlatformSpec,
  others: readonly PlatformSpec[],
): ValidationResult {
  const dy = B.row - A.row;
  if (dy <= 0) {
    return { valid: false, reason: `B (ряд ${B.row}) не выше A (ряд ${A.row})` };
  }
  if (dy > DY_HARD_MAX) {
    return {
      valid: false,
      reason: `dy=${dy.toFixed(2)} превышает физический предел ${DY_HARD_MAX.toFixed(2)} (h_apex=${H_APEX_ROWS})`,
    };
  }

  // Направление перехода не задано заранее (зигзаг чередует стороны) — берём
  // геометрию, соответствующую фактическому взаимному положению A/B.
  // rising-water.md §4 даёт формулы для прыжка ВПРАВО (x_takeoff = правый
  // край A − 0.5, x_land = левый край B + 0.5); при прыжке ВЛЕВО те же роли
  // играют зеркальные края (x_takeoff = левый край A + 0.5, x_land = правый
  // край B − 0.5). Берём направление с бОльшим D — при корректной
  // (не перекрывающейся сверх меры) раскладке ровно одно из двух больше нуля
  // и осмысленно, другое отрицательно или бессмысленно мало.
  const rightD = B.x + 0.5 - (A.x + A.width - 0.5);
  const leftD = A.x + 0.5 - (B.x + B.width - 0.5);
  const goingRight = rightD >= leftD;
  const xTakeoff = goingRight ? A.x + A.width - 0.5 : A.x + 0.5;
  const xLand = goingRight ? B.x + 0.5 : B.x + B.width - 0.5;
  const D = goingRight ? rightD : leftD;

  // Правило 4.1: часть A, свободная от B, шириной >= 2 блока.
  const overlapWithB = overlapLength(A.x, A.width, B.x, B.width);
  const freeWidth = A.width - overlapWithB;
  if (freeWidth < RUN_UP_ZONE_MIN_WIDTH) {
    return {
      valid: false,
      reason: `зона разбега на A свободна только на ${freeWidth.toFixed(2)} блока (нужно >= ${RUN_UP_ZONE_MIN_WIDTH})`,
    };
  }

  // Правило 4.2a: потолок над B — top(B)..top(B)+2, над диапазоном столбцов B.
  for (const p of others) {
    if (p.row > B.row && p.row <= B.row + CEILING_OVER_B_ROWS && rangesOverlap(p.x, p.width, B.x, B.width)) {
      return {
        valid: false,
        reason: `платформа на ряду ${p.row} нависает потолком над B (ряд ${B.row})`,
      };
    }
  }

  // Правило 4.2b: коридор полёта A→B — top(A)..top(A)+5.5, над [x_takeoff, x_land].
  const corridorMinX = Math.min(xTakeoff, xLand);
  const corridorMaxX = Math.max(xTakeoff, xLand);
  for (const p of others) {
    if (
      p.row > A.row &&
      p.row <= A.row + FLIGHT_CORRIDOR_ROWS &&
      rangesOverlap(p.x, p.width, corridorMinX, corridorMaxX - corridorMinX)
    ) {
      return {
        valid: false,
        reason: `платформа на ряду ${p.row} перекрывает коридор полёта A(ряд ${A.row})→B`,
      };
    }
  }

  // Правило 4.3: x_min(dy)+0.05 <= D <= 0.7*dx_max(dy).
  const range = safeReachRange(dy);
  if (D < range.min || D > range.max) {
    return {
      valid: false,
      reason: `дальность D=${D.toFixed(2)} вне [${range.min.toFixed(2)}, ${range.max.toFixed(2)}] для dy=${dy.toFixed(2)}`,
    };
  }

  return { valid: true };
}

/**
 * Проверяет весь этап по правилам 4.1–4.4 (rising-water.md §4): каждое
 * звено пути «земля(зона спавна) → platforms[0] → ... → exit» и положение
 * выхода в верхней зоне [H(n)−3, H(n)−1] (rising-water.md §5).
 */
export function validateStage(stage: Stage): ValidationResult {
  const exitAsPlatform: PlatformSpec = {
    x: stage.exit.x,
    row: stage.exit.row,
    width: stage.exit.width,
  };
  const spawnZone: PlatformSpec = { x: stage.spawn.x, row: 0, width: SPAWN_ZONE_WIDTH };
  const allObstacles: PlatformSpec[] = [...stage.platforms, exitAsPlatform];
  const chain: PlatformSpec[] = [spawnZone, ...stage.platforms, exitAsPlatform];

  for (let i = 0; i < chain.length - 1; i++) {
    const A = chain[i]!;
    const B = chain[i + 1]!;
    const others = allObstacles.filter((p) => p !== A && p !== B);
    const result = checkTransition(A, B, others);
    if (!result.valid) {
      return { valid: false, reason: `звено ${i} (ряд ${A.row}→${B.row}): ${result.reason}` };
    }
    // Правила 4.1–4.3 — быстрый аналитический фильтр. Источник правды —
    // симуляция прыжка со всеми платформами этапа (jumpSimulator.ts): только
    // она ловит удар головой о платформу над зоной разбега.
    if (!canReach(A, B, [...allObstacles, worldCeiling(stage.heightRows)])) {
      return {
        valid: false,
        reason: `звено ${i} (ряд ${A.row}→${B.row}): симуляция прыжка не долетает до B`,
      };
    }
  }

  const zoneMin = exitZoneMinRow(stage.heightRows);
  const zoneMax = exitZoneMaxRow(stage.heightRows);
  if (stage.exit.row < zoneMin || stage.exit.row > zoneMax) {
    return {
      valid: false,
      reason: `выход (ряд ${stage.exit.row}) вне верхней зоны [${zoneMin}, ${zoneMax}]`,
    };
  }

  return { valid: true };
}

interface StepBounds {
  minRow?: number;
  maxRow?: number;
}

/**
 * Подбирает следующую платформу B из текущей точки A (зигзаг), пробуя
 * несколько случайных (dy, D) до тех пор, пока переход не пройдёт
 * checkTransition против уже построенных платформ. Возвращает null, если не
 * удалось за отведённое число попыток — вызывающая сторона (generatePath)
 * прерывает построение всего этапа и просит generateStage повторить целиком
 * со следующей порцией chисел rng (детерминированно за счёт общего seed).
 */
export function pickStep(
  A: PlatformSpec,
  platformWidth: number,
  side: 1 | -1,
  rng: Rng,
  existing: readonly PlatformSpec[],
  bounds: StepBounds = {},
  verify?: (candidate: PlatformSpec) => boolean,
): PlatformSpec | null {
  const localAttempts = 60;

  for (let i = 0; i < localAttempts; i++) {
    let dy: number;
    if (bounds.minRow !== undefined && bounds.maxRow !== undefined) {
      const targetRow = bounds.minRow + rng() * (bounds.maxRow - bounds.minRow);
      dy = targetRow - A.row;
      // Шаг к выходу подчиняется тому же DY_MAX_ROWS, что и обычные шаги:
      // раньше тут стоял DY_HARD_MAX (4.9), а реальный апекс при шаге 1/60 с
      // около 4.8 ряда — выход мог оказаться выше потолка прыжка.
      if (dy < DY_MIN_ROWS || dy > DY_MAX_ROWS) continue;
    } else {
      dy = DY_MIN_ROWS + rng() * (DY_MAX_ROWS - DY_MIN_ROWS);
    }

    const range = safeReachRange(dy);
    if (range.max <= range.min) continue;
    const D = range.min + rng() * (range.max - range.min);
    const brow = A.row + dy;

    let bx: number;
    if (side === 1) {
      const xTakeoff = A.x + A.width - 0.5;
      const xLand = xTakeoff + D;
      bx = xLand - 0.5;
    } else {
      const xTakeoff = A.x + 0.5;
      const xLand = xTakeoff - D;
      bx = xLand - platformWidth + 0.5;
    }
    bx = clamp(bx, 0, GRID_COLUMNS - platformWidth);

    const candidate: PlatformSpec = { x: bx, row: brow, width: platformWidth };
    const check = checkTransition(A, candidate, existing);
    if (check.valid && (!verify || verify(candidate))) return candidate;
  }

  return null;
}

/**
 * Сколько рядов вниз от новой платформы может достать её влияние на уже
 * построенные прыжки: голова игрока поднимается до A.row + ~4.8 + 1.5, а
 * низ платформы на 1 ряд ниже её верха. С запасом — 10 рядов.
 */
const RECHECK_DEPTH_ROWS = 10;

/**
 * Проверка кандидата симуляцией (jumpSimulator.ts): до него можно допрыгнуть
 * с `current`, и он не ломает уже построенные прыжки ниже — например, не
 * нависает над зоной разбега предыдущей платформы.
 */
function makeVerifier(
  chain: readonly PlatformSpec[],
  platforms: readonly PlatformSpec[],
  heightRows: number,
): (candidate: PlatformSpec) => boolean {
  return (candidate) => {
    const withCandidate = [...platforms, candidate, worldCeiling(heightRows)];
    const current = chain[chain.length - 1]!;
    if (!canReach(current, candidate, withCandidate)) return false;
    for (let i = chain.length - 2; i >= 0; i--) {
      const A = chain[i]!;
      if (A.row < candidate.row - RECHECK_DEPTH_ROWS) break;
      if (!canReach(A, chain[i + 1]!, withCandidate)) return false;
    }
    return true;
  };
}

/** Цель считается достигнутой, когда центр платформы ближе этого, блоки. */
const TARGET_REACHED_BLOCKS = 3;

function centerX(p: PlatformSpec): number {
  return p.x + p.width / 2;
}

/**
 * Новая цель для центра платформы на противоположной от `fromCenterX`
 * половине мира, с отступом полплатформы от стены.
 */
function pickFarTarget(fromCenterX: number, platformWidth: number, rng: Rng): number {
  const minCenter = platformWidth / 2;
  const maxCenter = GRID_COLUMNS - platformWidth / 2;
  const mid = GRID_COLUMNS / 2;
  const [lo, hi] =
    fromCenterX < mid ? [mid + 4, maxCenter] : [minCenter, mid - 4];
  return lo + rng() * Math.max(0, hi - lo);
}

/** Один проход построения этапа снизу вверх. null — если сорвался локальный подбор шага. */
export function generatePath(n: number, heightRows: number, platformWidth: number, rng: Rng): Stage | null {
  const platforms: PlatformSpec[] = [];
  const spawnZone: PlatformSpec = { x: SPAWN_X, row: 0, width: SPAWN_ZONE_WIDTH };
  const chain: PlatformSpec[] = [spawnZone];
  let current = spawnZone;
  let side: 1 | -1 = 1;
  // Путь петляет по всей ширине мира: генератор выбирает цель на дальней
  // половине экрана и идёт к ней несколько шагов подряд в одну сторону,
  // дойдя — выбирает новую цель на противоположной половине. Раньше стороны
  // строго чередовались, и путь топтался в полосе ~15 блоков у левого края,
  // оставляя большую часть экрана пустой (замечание пользователя 24.09.2026).
  let targetCenterX = pickFarTarget(centerX(spawnZone), platformWidth, rng);

  const topZoneMin = exitZoneMinRow(heightRows);
  const topZoneMax = exitZoneMaxRow(heightRows);

  // Защита от бесконечного цикла: количество шагов ограничено разумной
  // оценкой rising-water.md §5 (H(n)/avg(dy) ≈ H(n)/3) с большим запасом.
  const maxSteps = Math.ceil(heightRows / DY_MIN_ROWS) + 10;
  let steps = 0;

  // Строим, пока от текущей платформы нельзя одним шагом (<= DY_MAX_ROWS)
  // попасть в зону выхода. После цикла current.row ∈ [topZoneMin − 4, topZoneMin),
  // так что шаг к выходу dy ∈ [DY_MIN_ROWS, DY_MAX_ROWS] всегда существует.
  while (current.row + DY_MAX_ROWS < topZoneMin) {
    if (steps >= maxSteps) return null;
    steps += 1;

    if (Math.abs(centerX(current) - targetCenterX) < TARGET_REACHED_BLOCKS) {
      targetCenterX = pickFarTarget(centerX(current), platformWidth, rng);
    }
    side = targetCenterX >= centerX(current) ? 1 : -1;

    // Если в сторону цели шаг не строится (стена, нависающая платформа),
    // пробуем противоположную сторону, а не проваливаем весь этап.
    const verify = makeVerifier(chain, platforms, heightRows);
    let step = pickStep(current, platformWidth, side, rng, platforms, {}, verify);
    let actualSide: 1 | -1 = side;
    if (!step) {
      actualSide = side === 1 ? -1 : 1;
      step = pickStep(current, platformWidth, actualSide, rng, platforms, {}, verify);
    }
    if (!step) return null;

    platforms.push(step);
    chain.push(step);
    current = step;
    side = actualSide;
  }

  const exitBounds: StepBounds = {
    minRow: Math.max(topZoneMin, current.row + DY_MIN_ROWS),
    maxRow: Math.min(topZoneMax, current.row + DY_MAX_ROWS),
  };
  const verifyExit = makeVerifier(chain, platforms, heightRows);
  let exitStep = pickStep(current, platformWidth, side, rng, platforms, exitBounds, verifyExit);
  if (!exitStep) {
    exitStep = pickStep(current, platformWidth, side === 1 ? -1 : 1, rng, platforms, exitBounds, verifyExit);
  }
  if (!exitStep) return null;

  return {
    n,
    heightRows,
    platformWidth,
    platforms,
    spawn: { x: SPAWN_X },
    exit: { x: exitStep.x, row: exitStep.row, width: exitStep.width },
  };
}

/**
 * Генерирует этап n. Seed = n (rising-water.md §1: «у всех игроков
 * одинаковые этапы»), поэтому generateStage(n) всегда возвращает один и тот
 * же результат. При нарушении правил проходимости перегенерирует (тот же
 * rng, следующая порция чисел — детерминированно за счёт общего seed), с
 * ограничением числа попыток (план «Волна C»: «перегенерировать при
 * нарушении (с ограничением попыток, детерминированно)»).
 */
export function generateStage(n: number, maxAttempts = 20000): Stage {
  // Номер этапа — он же seed. Без этой проверки undefined/NaN не падал, а
  // молча уходил в maxAttempts попыток: каждая проверяется симуляцией, и это
  // минуты (так зависали тесты, вызывающие create() без init()).
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`generateStage: номер этапа должен быть целым >= 1, получено ${String(n)}`);
  }
  const heightRows = stageHeightRows(n);
  // Platform.ts тайлит платформу поштучными блоками (Array.from по
  // widthBlocks*heightBlocks) — нецелая ширина (formula difficulty.ts даёт,
  // например, 5.667 для n=2) молча обрезалась бы Array.from до floor(width),
  // и физическая платформа оказалась бы уже той, что проверял validateStage.
  // Округляем здесь, в точке использования для рендера/физики; сама формула
  // в difficulty.ts остаётся точной (rising-water.md §5) для тестов/сверки.
  const platformWidth = Math.round(platformWidthBlocks(n));
  const rng = createRng(n);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generatePath(n, heightRows, platformWidth, rng);
    if (candidate && validateStage(candidate).valid) {
      return candidate;
    }
  }

  throw new Error(
    `generateStage: не удалось построить проходимый этап ${n} за ${maxAttempts} попыток (seed=${n})`,
  );
}
