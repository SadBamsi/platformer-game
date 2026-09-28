/**
 * Детерминированная симуляция прыжка A→B — источник правды для проходимости
 * этапа. Чистый модуль без Phaser, работает в единицах сетки: x в блоках
 * (растёт вправо), высота в рядах от земли (растёт вверх).
 *
 * Зачем он нужен: аналитические правила 4.1–4.3 (rising-water.md §4) не
 * учитывали рост игрока и толщину платформ. Игрок бился головой о следующую
 * платформу зигзага, которая висела над его зоной разбега, и не добирался до B.
 * Симуляция ловит это по построению, потому что сталкивает хитбокс игрока со
 * ВСЕМИ платформами этапа.
 *
 * Интеграция повторяет Arcade Physics (phaser@3.90.0,
 * physics/arcade/World.js:1266 computeVelocity → Body.js:1192 update):
 * semi-implicit Euler с фиксированным шагом 1/60 с (World.fps = 60,
 * fixedStep = true). Сначала `vy += g·dt`, затем `y += vy·dt`.
 * Засчитывается только чистый прыжок: любое касание платформы, кроме
 * приземления на B сверху, — провал (удар головой, касание боком).
 */
import {
  PLAYER_HITBOX_HEIGHT_BLOCKS,
  PLAYER_HITBOX_WIDTH_BLOCKS,
  PLAYER_JUMP_VELOCITY_COEFFICIENT,
  PLAYER_MOVE_SPEED_BLOCKS_PER_SEC,
  WORLD_GRAVITY_COEFFICIENT,
} from '@/game/dimensions';

export interface SimPlatform {
  /** Левый край, блоки. */
  x: number;
  /** Верхняя (ходибельная) поверхность, ряд от земли. Толщина — 1 ряд. */
  row: number;
  width: number;
}

const DT = 1 / 60;
/** Хитбокс игрока (dimensions.ts), а не весь спрайт 1×1.5: x — центр хитбокса. */
const PLAYER_HALF_WIDTH = PLAYER_HITBOX_WIDTH_BLOCKS / 2;
const PLAYER_HEIGHT = PLAYER_HITBOX_HEIGHT_BLOCKS;
const PLATFORM_THICKNESS = 1;
/**
 * Запас на человека. Одна и та же тактика (точка отрыва, задержка бега,
 * точка остановки) должна срабатывать при ПОЛНОМ прыжке и при прыжке на 5%
 * слабее. Проверять только ослабленный прыжок нельзя: запас здесь
 * немонотонный. Слабый прыжок проходит под нависающей платформой, а полный
 * прыжок живого игрока (кнопка зажата) бьётся о неё головой.
 */
const JUMP_VELOCITY_VARIANTS = [1, 0.95] as const;
/**
 * Скорость бега только полная: с клавиатуры moveX бывает лишь 0 или ±1,
 * «бежать на 90%» игрок физически не может. Регулировать можно только
 * моментом начала и конца бега (runDelay, stopX).
 */
const RUN_SPEED_VARIANTS = [1] as const;
/**
 * Допуски на неточность игрока и задержку ввода. Проверка в настоящей игре
 * (24.09.2026) показала: тактика, которая в симуляции проходит с запасом
 * в 3 мс, в Phaser срывается, потому что между нажатием и движением проходит
 * 1–2 кадра. Поэтому тактика засчитывается, только если она срабатывает и
 * при опоздании с бегом на RUN_DELAY_JITTER секунд, и при отрыве на
 * TAKEOFF_JITTER блока дальше от B или ближе к нему. «Ближе» важно: игрок,
 * подходя к краю, проскакивает точку остановки (скорость гасится через кадр),
 * и если B начинается почти над краем A, он оказывается головой под B
 * (найдено сквозным прохождением на Arcade Physics, этап 3, 24.09.2026).
 */
const RUN_DELAY_JITTER = 0.1;
const TAKEOFF_JITTER = 0.25;
/**
 * Итоговый допуск на точку отрыва — в обе стороны: к ошибке игрока
 * (TAKEOFF_JITTER) добавляется проскок при остановке — до ~0.23 блока:
 * 6.875 блок/с · 1/60 с ≈ 0.115 блока за кадр, скорость гасится через кадр,
 * плюс кадр до реакции на отпускание. Берём 0.25. Проскок бывает и к B,
 * и от B — смотря с какой стороны игрок подходит к точке прыжка (найдено
 * сквозным прохождением после сужения хитбокса, этапы 2 и 4, 24.09.2026).
 */
const OVERSHOOT_JITTER = TAKEOFF_JITTER + 0.25;
const MAX_STEPS = 180;
const EPS = 1e-6;

const GRAVITY = WORLD_GRAVITY_COEFFICIENT;

function overlapsBody(cx: number, feet: number, p: SimPlatform): boolean {
  return (
    cx + PLAYER_HALF_WIDTH > p.x + EPS &&
    cx - PLAYER_HALF_WIDTH < p.x + p.width - EPS &&
    feet + PLAYER_HEIGHT > p.row - PLATFORM_THICKNESS + EPS &&
    feet < p.row - EPS
  );
}

/**
 * Один прыжок по фиксированной стратегии: отрыв из центра `x0` на A,
 * через `runDelay` секунд бег в сторону `dir`, остановка, когда центр дошёл
 * до `stopX`. Успех — приземление ногами на верх B.
 */
function simulate(
  A: SimPlatform,
  B: SimPlatform,
  obstacles: readonly SimPlatform[],
  x0: number,
  dir: 1 | -1,
  runDelay: number,
  stopX: number,
  jumpVelocity: number,
  runSpeed: number,
): boolean {
  let x = x0;
  let feet = A.row;
  let vy = jumpVelocity;
  let t = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    t += DT;

    // Ось X.
    const reachedStop = dir === 1 ? x >= stopX : x <= stopX;
    const vx = t >= runDelay && !reachedStop ? dir * runSpeed : 0;
    const nx = x + vx * DT;
    for (const p of obstacles) {
      // Любое касание боком — провал. Arcade выбирает ось разделения по
      // величине перекрытия, и при заходе под угол платформы может вытолкнуть
      // игрока вниз, вплоть до проталкивания сквозь пол (видели в браузере
      // 24.09.2026). Скольжение вдоль стенки поэтому не засчитываем.
      if (overlapsBody(nx, feet, p)) return false;
    }
    x = nx;

    // Ось Y.
    vy -= GRAVITY * DT;
    const nfeet = feet + vy * DT;
    for (const p of obstacles) {
      if (!overlapsBody(x, nfeet, p)) continue;
      if (vy < 0) {
        // Падаем на платформу: успех только если это B.
        return p === B;
      }
      // Удар головой. В Arcade игрок после него падает и иногда всё же
      // попадает на B, но пройти так может только тот, кто знает трюк.
      // Считаем проходимым лишь чистый прыжок без удара.
      return false;
    }
    feet = nfeet;

    // Провалились ниже A — переход не удался.
    if (feet < A.row - 2) return false;
  }
  return false;
}

/** Тактика прыжка, найденная симулятором. Нужна e2e-проверке в браузере. */
export interface JumpStrategy {
  /** Центр игрока в момент прыжка, блоки. */
  x0: number;
  dir: 1 | -1;
  /** Через сколько секунд после прыжка начать бег. */
  runDelay: number;
  /** Отпустить бег, когда центр дошёл сюда, блоки. */
  stopX: number;
  /** Доля полной скорости бега (сейчас всегда 1). */
  speedFactor: number;
}

/**
 * Можно ли живому игроку перепрыгнуть с A на B, если на этапе стоят
 * `platforms` (A и B могут входить в список). Перебирает точку отрыва по A,
 * задержку начала бега и точку остановки над B. Возвращает true при первом
 * успешном варианте.
 */
export function canReach(
  A: SimPlatform,
  B: SimPlatform,
  platforms: readonly SimPlatform[],
): boolean {
  return findJumpStrategy(A, B, platforms) !== null;
}

/** То же, что canReach, но возвращает найденную тактику (или null). */
export function findJumpStrategy(
  A: SimPlatform,
  B: SimPlatform,
  platforms: readonly SimPlatform[],
): JumpStrategy | null {
  // Только платформы, которые физически могут попасть в траекторию:
  // от чуть ниже A до потолка прыжка с ростом игрока.
  const minRow = A.row - 2;
  const maxRow = A.row + 10;
  const obstacles = platforms.filter((p) => p !== A && p.row >= minRow && p.row <= maxRow);
  if (!obstacles.includes(B)) obstacles.push(B);
  // A тоже препятствие (можно удариться о её бок при падении), но ноги
  // стартуют ровно на её верхе и не пересекают её.
  obstacles.push(A);

  const dir: 1 | -1 = B.x + B.width / 2 >= A.x + A.width / 2 ? 1 : -1;

  // Ближе к B отрываться выгоднее, поэтому перебираем от ближнего края A.
  const takeoffs: number[] = [];
  // С учётом TAKEOFF_JITTER точка отрыва не должна уходить за края A.
  for (
    let off = PLAYER_HALF_WIDTH + OVERSHOOT_JITTER;
    off <= A.width - PLAYER_HALF_WIDTH - OVERSHOOT_JITTER + EPS;
    off += 0.25
  ) {
    takeoffs.push(dir === 1 ? A.x + A.width - off : A.x + off);
  }
  const stops: number[] = [];
  for (let off = PLAYER_HALF_WIDTH; off <= B.width - PLAYER_HALF_WIDTH + EPS; off += 0.5) {
    stops.push(dir === 1 ? B.x + off : B.x + B.width - off);
  }

  for (const speedFactor of RUN_SPEED_VARIANTS) {
    const runSpeed = PLAYER_MOVE_SPEED_BLOCKS_PER_SEC * speedFactor;
    for (const x0 of takeoffs) {
      for (let runDelay = 0; runDelay <= 0.4 + EPS; runDelay += 0.05) {
        for (const stopX of stops) {
          const robust = JUMP_VELOCITY_VARIANTS.every((jumpFactor) =>
            [0, RUN_DELAY_JITTER].every((delayJitter) =>
              [0, OVERSHOOT_JITTER, -OVERSHOOT_JITTER].every((takeoffJitter) =>
                simulate(
                  A,
                  B,
                  obstacles,
                  x0 - dir * takeoffJitter,
                  dir,
                  runDelay + delayJitter,
                  stopX,
                  PLAYER_JUMP_VELOCITY_COEFFICIENT * jumpFactor,
                  runSpeed,
                ),
              ),
            ),
          );
          if (robust) return { x0, dir, runDelay, stopX, speedFactor };
        }
      }
    }
  }
  return null;
}
