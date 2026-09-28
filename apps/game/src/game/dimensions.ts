/**
 * Размеры игрового поля. Вынесены в отдельный модуль БЕЗ импортов намеренно:
 * config.ts импортирует классы сцен (BootScene, PlatformerScene, ...), а
 * PlatformerScene.ts, в свою очередь, вычисляет константу на уровне модуля
 * (RESPAWN_Y_THRESHOLD) на основе размеров игры. Если бы размеры жили в
 * config.ts, это создавало бы цикл config.ts → PlatformerScene.ts → config.ts:
 * ESM инициализирует модуль сверху вниз, и на момент выполнения импортов
 * config.ts (до объявления его собственных констант) управление уходит в
 * PlatformerScene.ts, которая тут же пытается прочитать ещё не
 * проинициализированный экспорт — классическая ловушка TDZ
 * (`Cannot access '...' before initialization`), воспроизводимая только в
 * браузере (ssr:false режет её на SSR/сборке, см. отчёт по инциденту).
 * Этот модуль — лист графа зависимостей: его можно импортировать откуда
 * угодно в src/game/**, не создавая цикл.
 */
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
export const GRID_COLUMNS = 32;
export const GRID_ROWS = 18;

/**
 * Коэффициенты физики прыжка, выведенные в `docs/level-design.md` (раздел 2.3)
 * из дизайн-целей h_apex=5 блоков, t_up=0.4с. Оба — коэффициенты при
 * blockHeight (`scale.height / GRID_ROWS`), поэтому высота прыжка в блоках не
 * зависит от размера окна. Меняются только вместе, через формулы
 * `v = 2·h_apex/t_up`, `g = v/t_up` — см. level-design.md, не по отдельности.
 */
export const WORLD_GRAVITY_COEFFICIENT = 62.5;
export const PLAYER_JUMP_VELOCITY_COEFFICIENT = 25;

/**
 * Скорость бега в блоках/с, вынесена из Player.ts (волна C плана
 * linear-sparking-pike.md, «Волна C»): значение не меняется, это то же
 * MOVE_SPEED=220 / GRID_COLUMNS=32, что было раньше локальной константой в
 * Player.ts. Вынесена сюда, чтобы `rising/jumpReach.ts` (чистый модуль без
 * Phaser, формулы дальности прыжка из docs/rising-water.md §3) могла
 * использовать то же самое число без импорта Player.ts (который тянет
 * Phaser).
 */
export const PLAYER_MOVE_SPEED_BLOCKS_PER_SEC = 220 / GRID_COLUMNS;

/**
 * Хитбокс игрока в пикселях кадра спрайта (кадр 32×48, public/assets/sprite.svg,
 * нарезка в PreloadScene.registerGirlFrames). Девочка нарисована не на весь
 * кадр: в кадре стояния ноги занимают x 13..24, макушка — y ≈ 6. Хитбокс во
 * весь кадр выступал на ~0.4 блока за ноги, и игрок «стоял в воздухе» у края
 * платформы (замечено пользователем 24.09.2026).
 *
 * Когда девочка смотрит влево, картинка отражается (setFlipX), и хитбокс
 * сдвигается зеркально: левый край = 32 − 13 − 12 = 7.
 */
export const PLAYER_FRAME_WIDTH_PX = 32;
export const PLAYER_FRAME_HEIGHT_PX = 48;
export const PLAYER_HITBOX_WIDTH_PX = 12;
export const PLAYER_HITBOX_HEIGHT_PX = 42;
/** Левый край хитбокса, когда девочка смотрит вправо (кадр не отражён). */
export const PLAYER_HITBOX_OFFSET_X_PX = 13;
/** Верх хитбокса; низ совпадает с низом кадра (ноги). */
export const PLAYER_HITBOX_OFFSET_Y_PX = PLAYER_FRAME_HEIGHT_PX - PLAYER_HITBOX_HEIGHT_PX;

/** Спрайт игрока на экране — 1×1.5 блока (Player.resizeForGrid). */
export const PLAYER_SPRITE_HEIGHT_BLOCKS = 1.5;
/** Хитбокс в блоках — для симулятора прыжков и тестов. */
export const PLAYER_HITBOX_WIDTH_BLOCKS = PLAYER_HITBOX_WIDTH_PX / PLAYER_FRAME_WIDTH_PX;
export const PLAYER_HITBOX_HEIGHT_BLOCKS =
  (PLAYER_HITBOX_HEIGHT_PX / PLAYER_FRAME_HEIGHT_PX) * PLAYER_SPRITE_HEIGHT_BLOCKS;
