/**
 * Состояние воды — чистый модуль без Phaser (см. handoff волны C, план
 * `linear-sparking-pike.md`: «Water.ts — состояние surfaceRow... update(dtSec)»).
 * Отрисовка через Phaser.GameObjects.Graphics — Phaser-специфичная часть,
 * которую этот модуль намеренно НЕ делает: она живёт в PlatformerScene
 * (drawWater()), которая на каждый кадр читает water.surfaceRow и рисует
 * прямоугольник/волну в мировых координатах. Здесь — только тестируемая
 * без движка логика времени/уровня воды (rising-water.md §2.3/§2.4/§8).
 *
 * surfaceRow хранится в рядах (float), а не в пикселях — поэтому резиз
 * холста безопасен: сцена каждый кадр/резиз пересчитывает пиксели из
 * surfaceRow заново, а не наоборот (план, «Волна C», пункт про единицы сетки).
 */

/**
 * centerRow = footRow + playerH/2 = footRow + 0.75 — та же константа, что в
 * resizePlayer (rising-water.md §2.4). Используется для условия «утонул».
 */
const PLAYER_CENTER_OFFSET_ROWS = 0.75;

export interface WaterConfig {
  /** H(n) — высота этапа, ряды. */
  heightRows: number;
  /** v_water(n) — скорость подъёма воды, ряд/с. */
  speedRowsPerSec: number;
  /**
   * W_DELAY — задержка перед началом подъёма, секунды. По умолчанию —
   * WATER_START_DELAY_SECONDS из difficulty.ts; параметризовано для тестов.
   */
  startDelaySeconds: number;
}

export class Water {
  readonly heightRows: number;
  readonly speedRowsPerSec: number;
  readonly startDelaySeconds: number;
  private elapsedSeconds = 0;

  constructor(config: WaterConfig) {
    this.heightRows = config.heightRows;
    this.speedRowsPerSec = config.speedRowsPerSec;
    this.startDelaySeconds = config.startDelaySeconds;
  }

  /**
   * Продвигает время воды на dtSec. Вызывающая сторона (PlatformerScene)
   * обязана сама ограничивать dtSec сверху (~100 мс per кадр, план «Волна C»:
   * «delta ограничить сверху ~100 мс, чтобы после вкладки в фоне вода не
   * прыгала») — этот метод доверяет переданному значению без клампа, чтобы
   * оставаться простым и тестируемым (тест может передать любое dtSec явно).
   */
  update(dtSec: number): void {
    this.elapsedSeconds += Math.max(0, dtSec);
  }

  /**
   * waterRow(t) — текущая высота поверхности воды, ряд от земли.
   * rising-water.md §2.3/§8: clamp(v_water·max(0, t−W_DELAY), 0, H(n)).
   */
  get surfaceRow(): number {
    const activeSeconds = Math.max(0, this.elapsedSeconds - this.startDelaySeconds);
    const row = this.speedRowsPerSec * activeSeconds;
    return Math.min(this.heightRows, Math.max(0, row));
  }

  /**
   * drown ⇔ waterRow(t) ≥ footRow(t) + 0.75. rising-water.md §2.4/§8:
   * нестрогое ≥ — инженерное решение доки (раздел 7, п.2): момент касания
   * поверхности центром игрока засчитывается как утопление.
   */
  isDrowned(footRow: number): boolean {
    return this.surfaceRow >= footRow + PLAYER_CENTER_OFFSET_ROWS;
  }

  /** Сброс времени воды — используется при рестарте этапа (тот же seed). */
  reset(): void {
    this.elapsedSeconds = 0;
  }
}
