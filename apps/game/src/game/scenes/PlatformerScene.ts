import Phaser from "phaser";
import type { InputManager } from "@/game/input";
import type { GameEventBus } from "../bridge/GameEventBus";
import { ParallaxBackground } from "../entities/ParallaxBackground";
import { Enemies } from "../entities/Enemies";
import { Platform } from "../entities/Platform";
import { Player } from "../entities/Player";
import { GRID_COLUMNS, GRID_ROWS, WORLD_GRAVITY_COEFFICIENT } from "../dimensions";
import {
  WATER_ENABLED,
  WATER_START_DELAY_SECONDS,
  waterSpeedRowsPerSec,
} from "@/game/rising/difficulty";
import { generateStage, type PlatformSpec, type Stage } from "@/game/rising/stageGenerator";
import { Water } from "@/game/rising/Water";
import { HOUSE_SIZE_BLOCKS, housePlacement } from "@/game/rising/goal";
import { placeDecorations, TREE_KINDS, TREE_SIZE_BLOCKS, type Decoration } from "@/game/rising/decorations";
import { layoutPixelText } from "@/game/ui/pixelFont";
import { STAGE_CLEAR_DELAY_MS, STAGE_CLEAR_TITLE, stageClearSubtitle } from "@/game/ui/stageClear";

const LEVEL_ID = "rising-water";

/** Ограничение шага времени физики/воды — план «Волна C»: не даём delta
 * "прыгать" после вкладки в фоне (браузер может накопить огромный delta
 * между кадрами, пока вкладка была неактивна). */
const MAX_DELTA_MS = 100;
/** +10 очков за каждый новый ряд высоты, достигнутый впервые (rising-water.md §6.1). */
const SCORE_PER_NEW_ROW = 10;

interface StageInitData {
  stage?: number;
  lives?: number;
  score?: number;
}

/**
 * Данные, которые сцена несёт между рестартами этапа (та же вода/раскладка
 * по seed) и между этапами (следующий seed, жизни/счёт переносятся).
 * rising-water.md, план «Волна C»: «init({ stage, lives, score })».
 */
export class PlatformerScene extends Phaser.Scene {
  private stageNumber = 1;
  private stage!: Stage;
  private water!: Water;
  private player!: Player;
  private platformGroup!: Phaser.Physics.Arcade.StaticGroup;
  private levelPlatforms: Platform[] = [];
  /** Спецификации платформ в том же порядке, что и levelPlatforms (земля первая, выход последний). */
  private platformSpecs: PlatformSpec[] = [];
  /** Зона касания дома-цели (стены дома), только overlap, без коллизии. */
  private exitZone!: Phaser.GameObjects.Zone;
  /** Лесуны: толкают игрока, жизнь не отнимают (entities/Enemies.ts). */
  private enemies!: Enemies;
  private house!: Phaser.GameObjects.Image;
  /** Деревья-декорации: только картинки, без физики (rising/decorations.ts). */
  private decorations: Array<{ spec: Decoration; image: Phaser.GameObjects.Image }> = [];
  /** Этап пройден: игрок заморожен, висит надпись, ждём автостарта следующего. */
  private stageCleared = false;
  private stageClearBanner: Phaser.GameObjects.Graphics | null = null;
  private waterGraphics!: Phaser.GameObjects.Graphics;
  private background!: ParallaxBackground;
  private inputManager!: InputManager;
  private eventBus!: GameEventBus;
  private score = 0;
  private lives = 3;
  private paused = false;
  private elapsedSeconds = 0;
  private maxRowReached = 0;
  private lastWaterDistanceRows = -1;

  constructor() {
    super("PlatformerScene");
  }

  /**
   * Данные рестарта/перехода этапа. Вызывается Phaser ПЕРЕД create() при
   * КАЖДОМ scene.start('PlatformerScene', data) / scene.restart(data),
   * включая самый первый запуск (тогда data === {} — новая игра с этапа 1).
   */
  init(data: StageInitData = {}): void {
    this.stageNumber = data.stage ?? 1;
    this.lives = data.lives ?? 3;
    this.score = data.score ?? 0;
  }

  create(): void {
    const inputManager = this.registry.get("inputManager") as
      | InputManager
      | undefined;
    const eventBus = this.registry.get("eventBus") as GameEventBus | undefined;
    if (!inputManager || !eventBus) {
      // GameCanvas.tsx обязан положить оба сервиса в registry до создания Phaser.Game —
      // если их нет, значит нарушен контракт инициализации, а не штатная ситуация.
      throw new Error(
        "PlatformerScene: inputManager/eventBus не найдены в registry — GameCanvas должен положить их туда до старта сцены.",
      );
    }
    this.inputManager = inputManager;
    this.eventBus = eventBus;

    // Seed = номер этапа (rising-water.md §1) — детерминированная раскладка,
    // одинаковая у всех игроков и при рестарте того же этапа (тот же seed).
    this.stage = generateStage(this.stageNumber);
    this.water = new Water({
      heightRows: this.stage.heightRows,
      speedRowsPerSec: waterSpeedRowsPerSec(this.stageNumber),
      startDelaySeconds: WATER_START_DELAY_SECONDS,
    });
    this.elapsedSeconds = 0;
    this.maxRowReached = 0;
    this.lastWaterDistanceRows = -1;

    const blockHeight = this.blockHeight();
    const worldHeightPx = this.stage.heightRows * blockHeight;

    // Мир выше экрана: границы физики и камеры — W x H(n)·bh (rising-water.md §1).
    this.physics.world.setBounds(0, 0, this.scale.width, worldHeightPx);
    this.cameras.main.setBounds(0, 0, this.scale.width, worldHeightPx);

    this.background = new ParallaxBackground(this);

    this.platformGroup = this.physics.add.staticGroup();
    this.levelPlatforms = [];

    // Земля — обычная платформа шириной во весь мир на ряду 0 (rising-water.md §1),
    // плюс путь из stage.platforms, плюс платформа выхода — все три вида
    // трактуются единообразно для геометрии/resize (Platform.ts не отличает их).
    const groundSpec: PlatformSpec = { x: 0, row: 0, width: GRID_COLUMNS };
    const exitSpec: PlatformSpec = {
      x: this.stage.exit.x,
      row: this.stage.exit.row,
      width: this.stage.exit.width,
    };
    this.platformSpecs = [groundSpec, ...this.stage.platforms, exitSpec];

    this.platformSpecs.forEach((spec) => {
      this.levelPlatforms.push(
        new Platform(this.platformGroup, "grass-block-texture", spec.width, 1),
      );
    });

    // Деревья создаются после платформ и до дома и игрока: рисуются поверх
    // травы, но позади дома и девочки. В физику не добавляются.
    for (const kind of TREE_KINDS) {
      this.textures.get(`tree-${kind}`).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.decorations = placeDecorations(this.stage).map((spec) => ({
      spec,
      image: this.add.image(0, 0, `tree-${spec.kind}`).setOrigin(0.5, 1),
    }));

    this.createPlayerAnimations();

    // Дом-цель на платформе выхода (rising/goal.ts). Победа — только при
    // касании дома: приземлиться на платформу выхода мало, нужно дойти до
    // двери. Пиксель-арт: фильтр NEAREST, без сглаживания.
    this.stageCleared = false;
    this.stageClearBanner = null;
    this.textures.get("house-goal").setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.house = this.add
      .image(0, 0, "house-goal")
      .setOrigin(0.5, housePlacement(this.stage.exit).originY);

    // Триггер дома — отдельная static-зона (не в platformGroup, поэтому не
    // участвует в collider с игроком, только в overlap): дом не мешает
    // ходить и прыгать, а касание его стен засчитывается как победа.
    // Создаётся ДО первого resizeLevel() — она обращается к this.exitZone.
    this.exitZone = this.add.zone(0, 0, 10, 10);
    this.physics.add.existing(this.exitZone, true);

    // Враги — до resizeLevel(): он расставляет их по размеру блока.
    this.enemies = new Enemies(this, this.stage, (row, blockHeight) => this.rowToPixelY(row, blockHeight));

    this.resizeLevel();

    this.scale.on("resize", this.handleResize, this);
    // Systems.shutdown (src/scene/Systems.js) снимает только свои transition-
    // листенеры — this.scale принадлежит Game, а не Scene, и переживает
    // scene.start()/scene.restart(). Без явного снятия здесь: 1) после ухода
    // в GameOverScene ArcadePhysics.shutdown обнуляет this.physics.world, и
    // следующий resize окна падает с TypeError внутри обработчика; 2) при
    // рестарте этапа (loseLife()/handleExitReached() → scene.restart())
    // create() вызывается снова и вешает ВТОРОЙ обработчик поверх так и не
    // снятого первого — накопление на каждый цикл рестарта/game over.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.handleResize, this);
    });

    this.player = new Player(this, 0, 0);
    this.physics.add.collider(this.player, this.platformGroup);
    this.physics.add.collider(this.player, this.enemies.group);
    this.physics.add.overlap(this.player, this.exitZone, () => this.handleExitReached());

    this.resizePlayer(true);

    this.waterGraphics = this.add.graphics();
    if (WATER_ENABLED) this.drawWater();

    this.cameras.main.setBackgroundColor("#1d2333");
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.background.layout(this.scale.width, this.scale.height, this.cameras.main.scrollY);

    this.eventBus.emit("score:changed", { score: this.score });
    this.eventBus.emit("lives:changed", { lives: this.lives });
    this.eventBus.emit("stage:changed", { stage: this.stageNumber });
  }

  private createPlayerAnimations(): void {
    if (this.anims.exists("girl-idle")) return;

    this.anims.create({
      key: "girl-idle",
      frames: [
        { key: "girl-sprite", frame: "0" },
        { key: "girl-sprite", frame: "1" },
      ],
      frameRate: 3,
      repeat: -1,
    });
    this.anims.create({
      key: "girl-run",
      frames: this.anims.generateFrameNames("girl-sprite", {
        start: 2,
        end: 5,
        prefix: "",
      }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: "girl-jump",
      frames: [{ key: "girl-sprite", frame: "6" }],
      frameRate: 1,
    });
    this.anims.create({
      key: "girl-fall",
      frames: [{ key: "girl-sprite", frame: "7" }],
      frameRate: 1,
    });
  }

  override update(time: number, delta: number): void {
    // Порядок обязателен: сначала сообщаем «на земле ли игрок сейчас» (по состоянию
    // физики, посчитанному Arcade Physics до вызова этого update()), затем — update().
    this.inputManager.setGrounded(this.player.isGrounded());
    this.inputManager.update(time);

    // Этап пройден: игрок заморожен, висит надпись, следующий этап стартует
    // по таймеру (handleExitReached). Пауза и управление в это время не нужны.
    if (this.stageCleared) {
      return;
    }

    // Пауза реализована как флаг + остановка физического мира, а НЕ через
    // this.scene.pause(). Принципиальная причина: scene.pause() останавливает
    // вызовы этого самого update(), а InputManager опрашивается только отсюда —
    // после такой паузы прочитать повторное нажатие PAUSE было бы некому, и
    // игра оставалась бы замороженной навсегда, с единственным выходом через
    // перезагрузку страницы. Здесь update() продолжает крутиться и читать ввод,
    // замирает только игровая логика и физика, поэтому пауза снимается тем же
    // действием PAUSE.
    if (this.inputManager.state.justPressed("PAUSE")) {
      this.paused = !this.paused;
      if (this.paused) {
        this.physics.world.pause();
      } else {
        this.physics.world.resume();
      }
    }

    if (this.paused) {
      return;
    }

    // Вода обновляется ЗДЕСЬ (после проверки паузы), чтобы на паузе она тоже
    // стояла — план «Волна C»: «вода обновляется после if (this.paused) return».
    // delta ограничен MAX_DELTA_MS: browser может накопить огромный delta,
    // пока вкладка была в фоне (rAF не тикал) — без клампа вода скачком
    // "телепортировалась" бы вверх на пропущенное время одним кадром.
    const dtSec = Math.min(delta, MAX_DELTA_MS) / 1000;
    if (WATER_ENABLED) this.water.update(dtSec);
    this.elapsedSeconds += dtSec;

    this.player.update(this.inputManager);

    const footRow = this.centerPixelYToFootRow(this.player.y, this.blockHeight());
    this.trackRowScore(footRow);

    // Вода временно выключена флагом WATER_ENABLED (difficulty.ts).
    if (!WATER_ENABLED) return;

    this.updateWaterHud(footRow);
    this.drawWater();

    if (this.water.isDrowned(footRow)) {
      this.loseLife();
      return;
    }
  }

  private handleResize(
    gameSize: Phaser.Structs.Size,
    _baseSize: Phaser.Structs.Size,
    _displaySize: Phaser.Structs.Size,
    previousWidth: number,
    previousHeight: number,
  ): void {
    const blockHeight = gameSize.height / GRID_ROWS;
    const worldHeightPx = this.stage.heightRows * blockHeight;
    this.physics.world.setBounds(0, 0, gameSize.width, worldHeightPx);
    this.cameras.main.setBounds(0, 0, gameSize.width, worldHeightPx);
    this.resizeLevel();
    this.resizePlayer(false, previousWidth, previousHeight);
    this.background.layout(gameSize.width, gameSize.height, this.cameras.main.scrollY);
    if (this.stageCleared) this.drawStageClearBanner();
  }

  private blockWidth(): number {
    return this.scale.width / GRID_COLUMNS;
  }

  private blockHeight(): number {
    return this.scale.height / GRID_ROWS;
  }

  /**
   * Переводит номер ряда r (rising-water.md §1: 0 = земля, растёт вверх) в
   * Phaser-строку сетки (top-left, растёт вниз) ДЛЯ РАЗМЕЩЕНИЯ БЛОКА толщиной
   * 1 ряд, чья ходибельная поверхность — на высоте r. Проверено обратной
   * подстановкой против легаси-поведения (level-design.md §5.1): при
   * heightRows=GRID_ROWS и r=0 (земля) должно получиться GRID_ROWS-1 — ровно
   * то место, где земля стояла до введения многоэтажного мира.
   * ВНИМАНИЕ: это на 1 ряд ниже буквальной формулы rising-water.md §1
   * (`worldPixelY=(H−r)·bh`) — применённая буквально, та формула ставит
   * землю на Phaser-ряд H (вне мира, ниже видимой нижней границы). Открытый
   * вопрос для QA/волны A, см. хэндофф.
   */
  private rowToPhaserTopRow(row: number): number {
    return this.stage.heightRows - 1 - row;
  }

  /** Пиксель Y для ряда r (та же формула rowToPhaserTopRow, но в пикселях, для непрерывных величин типа воды/foot). */
  private rowToPixelY(row: number, blockHeight: number): number {
    return this.rowToPhaserTopRow(row) * blockHeight;
  }

  /** Пиксель Y ЦЕНТРА спрайта игрока, стоящего ногами на ряду footRow (origin 0.5/0.5, playerH=1.5 → центр на 0.75 ряда выше ног). */
  private footRowToCenterPixelY(footRow: number, blockHeight: number): number {
    return this.rowToPixelY(footRow, blockHeight) - 0.75 * blockHeight;
  }

  /** Обратное преобразование: из пикселя Y центра спрайта — ряд, на котором стоят его ноги. */
  private centerPixelYToFootRow(centerY: number, blockHeight: number): number {
    return this.stage.heightRows - 1 - 0.75 - centerY / blockHeight;
  }

  private resizeLevel(): void {
    const blockWidth = this.blockWidth();
    const blockHeight = this.blockHeight();
    this.physics.world.gravity.y = blockHeight * WORLD_GRAVITY_COEFFICIENT;

    this.platformSpecs.forEach((spec, index) => {
      const phaserRow = this.rowToPhaserTopRow(spec.row);
      this.levelPlatforms[index]!.resize(spec.x, phaserRow, blockWidth, blockHeight);
    });

    for (const { spec, image } of this.decorations) {
      image
        .setPosition(spec.centerX * blockWidth, this.rowToPixelY(spec.baseRow, blockHeight))
        .setDisplaySize(TREE_SIZE_BLOCKS * blockWidth, TREE_SIZE_BLOCKS * blockHeight);
    }

    // Дом стоит на платформе выхода, зона касания — его стены
    // (rising/goal.ts, housePlacement).
    const placement = housePlacement(this.stage.exit);
    const baseY = this.rowToPixelY(placement.baseRow, blockHeight);
    this.house
      .setPosition(placement.centerX * blockWidth, baseY)
      .setDisplaySize(HOUSE_SIZE_BLOCKS * blockWidth, HOUSE_SIZE_BLOCKS * blockHeight);

    const { trigger } = placement;
    const triggerWidth = trigger.width * blockWidth;
    const triggerHeight = trigger.heightRows * blockHeight;
    this.exitZone.setPosition(
      (trigger.x + trigger.width / 2) * blockWidth,
      this.rowToPixelY(trigger.bottomRow, blockHeight) - triggerHeight / 2,
    );
    this.exitZone.setSize(triggerWidth, triggerHeight);
    const exitBody = this.exitZone.body as Phaser.Physics.Arcade.StaticBody;
    exitBody.setSize(triggerWidth, triggerHeight);
    exitBody.updateFromGameObject();

    this.enemies.layout(blockWidth, blockHeight);
  }

  /**
   * @param resetPosition Поставить игрока в стартовую точку сетки вместо
   *   пересчёта текущей позиции (старт этапа / рестарт после loseLife()).
   * @param previousWidth Ширина канвы ДО этого резиза — 4-й аргумент события
   *   RESIZE (ScaleManager.js:993, `refresh()`). Обязателен при
   *   `resetPosition=false`: `this.scale.width` на момент вызова уже НОВЫЙ
   *   (ScaleManager пересчитывает размеры и только потом эмитит событие), так
   *   что `player.x / this.scale.width` был бы делением на новую, а не старую
   *   ширину — тождество, а не пересчёт координаты под новый размер.
   * @param previousHeight Аналогично `previousWidth`, 5-й аргумент события.
   *   Используется здесь, чтобы вычислить СТАРЫЙ blockHeight и перевести
   *   текущую позицию игрока в ряд (rising-water.md: «хранить состояние в
   *   единицах сетки, чтобы резиз был безопасен») — мир может быть выше
   *   экрана, поэтому старая ratio-формула (y/scale.height) здесь неверна:
   *   ряд игрока не зависит от того, что мир выше вьюпорта.
   */
  private resizePlayer(
    resetPosition = false,
    previousWidth?: number,
    previousHeight?: number,
  ): void {
    const blockWidth = this.blockWidth();
    const blockHeight = this.blockHeight();

    let targetX: number;
    let targetY: number;

    if (resetPosition) {
      targetX = blockWidth * (this.stage.spawn.x + 1);
      targetY = this.footRowToCenterPixelY(0, blockHeight);
    } else {
      // Без previousWidth/Height (например, гипотетический вызов не из
      // handleResize) деградируем к старому поведению "как есть" — тождеству —
      // чем к делению на 0/NaN.
      const prevWidth = previousWidth ?? this.scale.width;
      const prevHeight = previousHeight ?? this.scale.height;
      const prevBlockHeight = prevHeight / GRID_ROWS;
      const xRatio = this.player.x / prevWidth;
      const footRow = this.centerPixelYToFootRow(this.player.y, prevBlockHeight);
      targetX = xRatio * this.scale.width;
      targetY = this.footRowToCenterPixelY(footRow, blockHeight);
    }

    this.player.resizeForGrid(blockWidth, blockHeight);
    this.player.setPosition(targetX, targetY);
  }

  /** +10 очков за каждый новый ЦЕЛЫЙ ряд высоты, впервые достигнутый игроком (rising-water.md §6.1). */
  private trackRowScore(footRow: number): void {
    const currentRowFloor = Math.floor(footRow);
    if (currentRowFloor > this.maxRowReached) {
      const newRows = currentRowFloor - this.maxRowReached;
      this.maxRowReached = currentRowFloor;
      this.score += newRows * SCORE_PER_NEW_ROW;
      this.eventBus.emit("score:changed", { score: this.score });
    }
  }

  /** Индикатор «вода в N рядах под тобой» — эмитит событие ТОЛЬКО при изменении целого значения (план «Волна C»). */
  private updateWaterHud(footRow: number): void {
    const distanceRows = Math.max(0, Math.floor(footRow - this.water.surfaceRow));
    if (distanceRows !== this.lastWaterDistanceRows) {
      this.lastWaterDistanceRows = distanceRows;
      this.eventBus.emit("water:changed", { distanceRows });
    }
  }

  private drawWater(): void {
    const blockWidth = this.blockWidth();
    const blockHeight = this.blockHeight();
    const worldWidthPx = this.scale.width;
    const worldHeightPx = this.stage.heightRows * blockHeight;
    const surfaceY = this.rowToPixelY(this.water.surfaceRow, blockHeight);

    this.waterGraphics.clear();
    if (surfaceY >= worldHeightPx) return; // вода ещё не поднялась (W_DELAY) — ничего не рисуем

    this.waterGraphics.fillStyle(0x2a6f97, 0.55);
    this.waterGraphics.fillRect(0, surfaceY, worldWidthPx, worldHeightPx - surfaceY);

    // Простая "волна" по поверхности — синусоида по X, без партиклов/шейдеров.
    this.waterGraphics.lineStyle(3, 0x8ecae6, 0.85);
    this.waterGraphics.beginPath();
    const waveAmplitude = blockHeight * 0.12;
    const waveLength = Math.max(1, blockWidth * 4);
    const t = this.time.now / 300;
    const step = Math.max(1, blockWidth / 2);
    for (let x = 0; x <= worldWidthPx; x += step) {
      const y = surfaceY + Math.sin(x / waveLength + t) * waveAmplitude;
      if (x === 0) this.waterGraphics.moveTo(x, y);
      else this.waterGraphics.lineTo(x, y);
    }
    this.waterGraphics.strokePath();
  }

  /** Игрок утонул (вода накрыла центр) — минус жизнь, рестарт ТЕКУЩЕГО этапа (тот же seed). */
  private loseLife(): void {
    this.lives -= 1;
    this.eventBus.emit("lives:changed", { lives: this.lives });

    if (this.lives <= 0) {
      const durationMs = Math.round(this.elapsedSeconds * 1000);
      this.eventBus.emit("game:over", {
        score: this.score,
        levelId: LEVEL_ID,
        stageReached: this.stageNumber,
        durationMs,
      });
      this.scene.start("GameOverScene", {
        score: this.score,
        levelId: LEVEL_ID,
        stageReached: this.stageNumber,
        durationMs,
      });
      return;
    }

    // Рестарт ТОГО ЖЕ этапа: та же raскладка (generateStage детерминирован по
    // seed=stageNumber), вода и позиция игрока начинаются заново — решение
    // пользователя («вода догнала → минус жизнь, рестарт этапа, тот же seed»).
    this.scene.restart({ stage: this.stageNumber, lives: this.lives, score: this.score });
  }

  /** Игрок дошёл до выхода — бонус за оставшееся время, переход на следующий этап. */
  private handleExitReached(): void {
    // Overlap с домом срабатывает каждый шаг физики, пока игрок в зоне, —
    // бонус и таймер следующего этапа должны сработать ровно один раз.
    if (this.stageCleared) return;
    this.stageCleared = true;

    // rising-water.md §6.1: exitBonus(n) = 100·n + 10·secondsLeft,
    // secondsLeft = max(0, T(n) − (t_exit − W_DELAY)).
    const activeWaterSeconds = Math.max(0, this.elapsedSeconds - WATER_START_DELAY_SECONDS);
    const secondsLeft = Math.max(
      0,
      this.water.heightRows / this.water.speedRowsPerSec - activeWaterSeconds,
    );
    const exitBonus = Math.round(100 * this.stageNumber + 10 * secondsLeft);
    this.score += exitBonus;
    this.eventBus.emit("score:changed", { score: this.score });

    const durationMs = Math.round(this.elapsedSeconds * 1000);
    this.eventBus.emit("level:completed", { levelId: LEVEL_ID, durationMs });

    this.freezeForStageClear();
    this.drawStageClearBanner();

    const nextStage = this.stageNumber + 1;
    this.time.delayedCall(STAGE_CLEAR_DELAY_MS, () => {
      this.scene.restart({ stage: nextStage, lives: this.lives, score: this.score });
    });
  }

  /** Игрок замирает на месте: физика стоит до рестарта сцены. */
  private freezeForStageClear(): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.enemies.stop();
    this.physics.world.pause();
  }

  /**
   * Пиксельная надпись о победе поверх экрана (ui/pixelFont.ts). Закреплена
   * на экране (scrollFactor 0). Размер клетки шрифта — целое число экранных
   * пикселей, чтобы буквы оставались чёткими; при резизе перерисовывается.
   */
  private drawStageClearBanner(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const banner = this.stageClearBanner ?? this.add.graphics().setScrollFactor(0).setDepth(100);
    this.stageClearBanner = banner;
    banner.clear();

    banner.fillStyle(0x0b0e1f, 0.45);
    banner.fillRect(0, 0, width, height);

    const title = layoutPixelText(STAGE_CLEAR_TITLE);
    const subtitle = layoutPixelText(stageClearSubtitle(this.stageNumber));
    const titleCell = Math.max(2, Math.floor((width * 0.7) / title.width));
    const subtitleCell = Math.max(1, Math.floor(titleCell / 2));
    const gap = titleCell * 3;
    const totalHeight = title.height * titleCell + gap + subtitle.height * subtitleCell;
    const top = Math.round((height - totalHeight) / 2);

    const drawLine = (
      layout: ReturnType<typeof layoutPixelText>,
      cell: number,
      y: number,
      color: number,
    ): void => {
      const left = Math.round((width - layout.width * cell) / 2);
      // Тень на одну клетку вниз-вправо — надпись читается на любом фоне.
      banner.fillStyle(0x1d2333, 1);
      for (const [cx, cy] of layout.cells) {
        banner.fillRect(left + (cx + 1) * cell, y + (cy + 1) * cell, cell, cell);
      }
      banner.fillStyle(color, 1);
      for (const [cx, cy] of layout.cells) {
        banner.fillRect(left + cx * cell, y + cy * cell, cell, cell);
      }
    };

    drawLine(title, titleCell, top, 0xffd043);
    drawLine(subtitle, subtitleCell, top + title.height * titleCell + gap, 0xffffff);
  }
}
