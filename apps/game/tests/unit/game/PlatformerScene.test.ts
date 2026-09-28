import '../../setup/canvas-stub';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// См. подробное объяснение в tests/unit/game/Player.test.ts — то же самое
// нужно здесь, PlatformerScene.ts тоже импортирует 'phaser'.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<{ default?: unknown }>('phaser/dist/phaser.js');
  return { default: actual.default ?? actual };
});

// Player замокан модульно — чужая зона (entities/Player.ts, покрыта
// отдельным Player.test.ts), настоящий Phaser.Physics.Arcade.Sprite не
// инстанцируется без живого Phaser.Game/канваса.
// Вода в игре временно выключена флагом WATER_ENABLED (difficulty.ts), но
// её логика в сцене должна оставаться покрытой — включаем флаг для тестов.
vi.mock('@/game/rising/difficulty', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/game/rising/difficulty')>()),
  WATER_ENABLED: true,
}));

// Параллакс-фон — отдельная сущность с реальными текстурами и камерой
// (ParallaxBackground.ts); здесь проверяется только оркестрация сцены.
vi.mock('@/game/entities/ParallaxBackground', () => ({
  ParallaxBackground: class {
    layout = vi.fn();
  },
}));

vi.mock('@/game/entities/Player', () => {
  class FakePlayer {
    x = 0;
    y = 0;
    resizeForGrid = vi.fn();
    setPosition = vi.fn(function (this: FakePlayer, x: number, y: number) {
      this.x = x;
      this.y = y;
    });
    isGrounded = vi.fn(() => true);
    update = vi.fn();
    body = { setVelocity: vi.fn() };
  }
  return { Player: FakePlayer };
});

import Phaser from 'phaser';
import { PlatformerScene } from '@/game/scenes/PlatformerScene';
import { STAGE_CLEAR_DELAY_MS, STAGE_CLEAR_TITLE, stageClearSubtitle } from '@/game/ui/stageClear';
import { WATER_START_DELAY_SECONDS, waterSpeedRowsPerSec } from '@/game/rising/difficulty';
import { generateStage } from '@/game/rising/stageGenerator';

/**
 * Приватные (TS-only, доступны в рантайме) методы PlatformerScene, вызываемые
 * ниже как несвязанные функции прототипа через `.call(fakeThis, ...)` — тот
 * же приём, что уже применялся в этом файле до волны D (см. git-историю):
 * реальная сцена требует живой Phaser.Game с WebGL/канвасом, которых в jsdom
 * нет (vitest.config.ts). "fake this" реализует ровно ту часть Phaser Scene
 * API, которую читает/пишет вызываемый метод — это выполняет настоящий код
 * сцены, а не переписанную копию логики.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = PlatformerScene.prototype as any;

function makeFakeBlock() {
  return {
    setPosition: vi.fn(),
    setDisplaySize: vi.fn(),
    body: { setSize: vi.fn(), updateFromGameObject: vi.fn() },
  };
}

/** Мини-эмиттер, имитирующий именно ту часть Phaser.Structs.Scale API, что
 * использует PlatformerScene (on/off с контекстом). */
class FakeScaleEmitter {
  width = 960;
  height = 540;
  private listeners: Array<{ event: string; fn: (...args: unknown[]) => void; ctx: unknown }> = [];

  on(event: string, fn: (...args: unknown[]) => void, ctx: unknown): void {
    this.listeners.push({ event, fn, ctx });
  }

  off(event: string, fn: (...args: unknown[]) => void, ctx: unknown): void {
    this.listeners = this.listeners.filter(
      (l) => !(l.event === event && l.fn === fn && l.ctx === ctx),
    );
  }

  listenerCount(event: string): number {
    return this.listeners.filter((l) => l.event === event).length;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.filter((x) => x.event === event)) {
      l.fn.apply(l.ctx, args);
    }
  }
}

/** Мини-реализация this.events.once(SHUTDOWN, cb). */
class FakeEventsOnce {
  private shutdownCallbacks: Array<() => void> = [];

  once(event: string, cb: () => void): void {
    if (event === Phaser.Scenes.Events.SHUTDOWN) {
      this.shutdownCallbacks.push(cb);
    }
  }

  triggerShutdown(): void {
    const cbs = this.shutdownCallbacks.splice(0);
    cbs.forEach((cb) => cb());
  }
}

function makeFakeGraphics() {
  return {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    lineStyle: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
  };
}

/**
 * Полный fake `this` для create() — собирает все Phaser-подсистемы, которые
 * реально читает/пишет текущий create() (см. PlatformerScene.ts): registry
 * (inputManager/eventBus), physics.world/add, add.zone/add.graphics, anims,
 * cameras.main, scale, events, scene. generateStage(stageNumber) вызывается
 * по-настоящему (детерминированный чистый модуль, см. stageGenerator.test.ts) —
 * поэтому создание сцены для этапа 1 не мокается отдельно.
 */
function makeFakeScene(eventBusEmit = vi.fn()) {
  const scale = new FakeScaleEmitter();
  const events = new FakeEventsOnce();
  const sceneApi = { start: vi.fn(), restart: vi.fn() };
  const fakeScene: Record<string, unknown> = {
    // Phaser всегда вызывает init() перед create(); без data init() ставит
    // stage=1, lives=3, score=0. Fake вызывает create() напрямую, поэтому
    // задаём то же состояние здесь, иначе generateStage получит undefined.
    stageNumber: 1,
    lives: 3,
    score: 0,
    scale,
    events,
    scene: sceneApi,
    registry: {
      get: (key: string) =>
        key === 'inputManager'
          ? { setGrounded: vi.fn(), update: vi.fn(), state: { justPressed: () => false, justReleased: () => false } }
          : key === 'eventBus'
            ? { emit: eventBusEmit }
            : undefined,
    },
    physics: {
      world: {
        setBounds: vi.fn(),
        checkCollision: { down: true },
        gravity: { y: 0 },
        pause: vi.fn(),
        resume: vi.fn(),
      },
      add: {
        staticGroup: () => ({ create: () => makeFakeBlock() }),
        existing: vi.fn(),
        collider: vi.fn(),
        overlap: vi.fn(),
      },
    },
    anims: {
      exists: () => false,
      create: vi.fn(),
      generateFrameNames: vi.fn(() => []),
    },
    add: {
      zone: vi.fn(() => ({
        setPosition: vi.fn(),
        setSize: vi.fn(),
        body: { setSize: vi.fn(), updateFromGameObject: vi.fn() },
      })),
      graphics: vi.fn(() => makeFakeGraphics()),
      image: vi.fn(() => {
        const image = {
          setOrigin: vi.fn(() => image),
          setPosition: vi.fn(() => image),
          setDisplaySize: vi.fn(() => image),
        };
        return image;
      }),
    },
    textures: { get: vi.fn(() => ({ setFilter: vi.fn() })) },
    cameras: { main: { setBackgroundColor: vi.fn(), setBounds: vi.fn(), startFollow: vi.fn(), scrollY: 0 } },
    time: { now: 0 },
    blockWidth: proto.blockWidth,
    blockHeight: proto.blockHeight,
    rowToPhaserTopRow: proto.rowToPhaserTopRow,
    rowToPixelY: proto.rowToPixelY,
    footRowToCenterPixelY: proto.footRowToCenterPixelY,
    centerPixelYToFootRow: proto.centerPixelYToFootRow,
    resizeLevel: proto.resizeLevel,
    resizePlayer: proto.resizePlayer,
    drawWater: proto.drawWater,
    createPlayerAnimations: proto.createPlayerAnimations,
    handleResize: proto.handleResize,
  };
  return { fakeScene, scale, events, sceneApi, eventBusEmit };
}

describe('PlatformerScene.init — переносит stage/lives/score между рестартами (rising-water.md §8)', () => {
  it('без data — новая игра: stage=1, lives=3, score=0', () => {
    const fakeThis: Record<string, unknown> = {};
    proto.init.call(fakeThis, {});
    expect(fakeThis['stageNumber']).toBe(1);
    expect(fakeThis['lives']).toBe(3);
    expect(fakeThis['score']).toBe(0);
  });

  it('с data — переносит переданные значения', () => {
    const fakeThis: Record<string, unknown> = {};
    proto.init.call(fakeThis, { stage: 4, lives: 2, score: 350 });
    expect(fakeThis['stageNumber']).toBe(4);
    expect(fakeThis['lives']).toBe(2);
    expect(fakeThis['score']).toBe(350);
  });
});

describe('PlatformerScene — геометрия рядов (rowToPhaserTopRow/footRowToCenterPixelY/centerPixelYToFootRow)', () => {
  it('rowToPhaserTopRow(0) = heightRows-1 — земля лежит в ПОСЛЕДНЕМ ряду мира (не героightRows, см. открытый вопрос §1 дизайн-дока)', () => {
    const fakeThis = { stage: { heightRows: 60 } };
    expect(proto.rowToPhaserTopRow.call(fakeThis, 0)).toBe(59);
  });

  it('rowToPhaserTopRow убывает на 1 при увеличении row на 1 (растёт вверх -> Phaser-ряд уменьшается)', () => {
    const fakeThis = { stage: { heightRows: 60 } };
    expect(proto.rowToPhaserTopRow.call(fakeThis, 10)).toBe(49);
    expect(proto.rowToPhaserTopRow.call(fakeThis, 11)).toBe(48);
  });

  it('centerPixelYToFootRow — обратное преобразование footRowToCenterPixelY (round-trip)', () => {
    const fakeThis = {
      stage: { heightRows: 60 },
      rowToPhaserTopRow: proto.rowToPhaserTopRow,
      rowToPixelY: proto.rowToPixelY,
      footRowToCenterPixelY: proto.footRowToCenterPixelY,
      centerPixelYToFootRow: proto.centerPixelYToFootRow,
    };
    const blockHeight = 30;
    for (const footRow of [0, 5, 12.5, 30]) {
      const centerY = proto.footRowToCenterPixelY.call(fakeThis, footRow, blockHeight);
      const back = proto.centerPixelYToFootRow.call(fakeThis, centerY, blockHeight);
      expect(back).toBeCloseTo(footRow, 9);
    }
  });

  it('спавн (footRow=0) даёт тот же пиксель Y, что и rowToPixelY(0) минус 0.75 ряда (центр спрайта выше ног)', () => {
    const fakeThis = { stage: { heightRows: 60 }, rowToPhaserTopRow: proto.rowToPhaserTopRow, rowToPixelY: proto.rowToPixelY };
    const blockHeight = 30;
    const groundTopY = proto.rowToPixelY.call(fakeThis, 0, blockHeight);
    const centerY = proto.footRowToCenterPixelY.call(fakeThis, 0, blockHeight);
    expect(groundTopY - centerY).toBeCloseTo(0.75 * blockHeight, 9);
  });
});

describe('PlatformerScene.trackRowScore — +10 очков за каждый новый ЦЕЛЫЙ ряд (rising-water.md §6.1)', () => {
  it('не начисляет очки, пока footRow не пересёк следующий целый ряд', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { maxRowReached: 0, score: 0, eventBus };

    proto.trackRowScore.call(fakeThis, 0.5);

    expect(fakeThis.score).toBe(0);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('начисляет +10 за первый достигнутый целый ряд и эмитит score:changed', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { maxRowReached: 0, score: 0, eventBus };

    proto.trackRowScore.call(fakeThis, 1.2);

    expect(fakeThis.score).toBe(10);
    expect(fakeThis.maxRowReached).toBe(1);
    expect(eventBus.emit).toHaveBeenCalledWith('score:changed', { score: 10 });
  });

  it('прыжок сразу через несколько рядов начисляет очки за каждый пропущенный ряд', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { maxRowReached: 0, score: 0, eventBus };

    proto.trackRowScore.call(fakeThis, 4.9); // ряды 1,2,3,4 — 4 новых ряда

    expect(fakeThis.score).toBe(40);
    expect(fakeThis.maxRowReached).toBe(4);
  });

  it('не начисляет очки повторно за уже достигнутый ряд (например, после падения назад)', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { maxRowReached: 5, score: 50, eventBus };

    proto.trackRowScore.call(fakeThis, 2.0); // упал ниже maxRowReached

    expect(fakeThis.score).toBe(50);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });
});

describe('PlatformerScene.updateWaterHud — water:changed эмитится только при изменении ЦЕЛОГО расстояния', () => {
  it('эмитит при первом вызове (lastWaterDistanceRows=-1 отличается от любого валидного значения)', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { water: { surfaceRow: 2 }, lastWaterDistanceRows: -1, eventBus };

    proto.updateWaterHud.call(fakeThis, 10);

    expect(eventBus.emit).toHaveBeenCalledWith('water:changed', { distanceRows: 8 });
    expect(fakeThis.lastWaterDistanceRows).toBe(8);
  });

  it('не эмитит повторно, если целая часть расстояния не изменилась', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { water: { surfaceRow: 2 }, lastWaterDistanceRows: 8, eventBus };

    proto.updateWaterHud.call(fakeThis, 10.9); // floor(10.9-2)=8, то же целое

    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('distanceRows не уходит в отрицательное значение (clamp на 0), если вода выше игрока', () => {
    const eventBus = { emit: vi.fn() };
    const fakeThis = { water: { surfaceRow: 20 }, lastWaterDistanceRows: -1, eventBus };

    proto.updateWaterHud.call(fakeThis, 5);

    expect(eventBus.emit).toHaveBeenCalledWith('water:changed', { distanceRows: 0 });
  });
});

describe('PlatformerScene.loseLife — утопление: минус жизнь, рестарт того же этапа; 0 жизней -> GameOverScene', () => {
  it('lives>0 после потери: emits lives:changed, scene.restart с тем же stage/lives/score, БЕЗ scene.start/game:over', () => {
    const eventBus = { emit: vi.fn() };
    const scene = { restart: vi.fn(), start: vi.fn() };
    const fakeThis = {
      lives: 3,
      eventBus,
      scene,
      stageNumber: 4,
      score: 120,
      elapsedSeconds: 10,
    };

    proto.loseLife.call(fakeThis);

    expect(fakeThis.lives).toBe(2);
    expect(eventBus.emit).toHaveBeenCalledWith('lives:changed', { lives: 2 });
    expect(eventBus.emit).not.toHaveBeenCalledWith('game:over', expect.anything());
    expect(scene.restart).toHaveBeenCalledWith({ stage: 4, lives: 2, score: 120 });
    expect(scene.start).not.toHaveBeenCalled();
  });

  it('lives доходит до 0: emits game:over{score,levelId,stageReached,durationMs} и scene.start("GameOverScene", тот же payload), БЕЗ scene.restart', () => {
    const eventBus = { emit: vi.fn() };
    const scene = { restart: vi.fn(), start: vi.fn() };
    const fakeThis = {
      lives: 1,
      eventBus,
      scene,
      stageNumber: 7,
      score: 999,
      elapsedSeconds: 12.345,
    };

    proto.loseLife.call(fakeThis);

    expect(fakeThis.lives).toBe(0);
    const expectedPayload = {
      score: 999,
      levelId: 'rising-water',
      stageReached: 7,
      durationMs: 12345,
    };
    expect(eventBus.emit).toHaveBeenCalledWith('lives:changed', { lives: 0 });
    expect(eventBus.emit).toHaveBeenCalledWith('game:over', expectedPayload);
    expect(scene.start).toHaveBeenCalledWith('GameOverScene', expectedPayload);
    expect(scene.restart).not.toHaveBeenCalled();
  });
});

/**
 * Заглушки для handleExitReached: заморозка и надпись рисуют в Phaser, а
 * таймер вызывает колбэк сразу — проверяем, что рестарт идёт именно через
 * него и с задержкой STAGE_CLEAR_DELAY_MS.
 */
function stageClearStubs() {
  return {
    stageCleared: false,
    freezeForStageClear: vi.fn(),
    drawStageClearBanner: vi.fn(),
    time: {
      delayedCall: vi.fn((_ms: number, callback: () => void) => callback()),
    },
  };
}

describe('PlatformerScene.handleExitReached — бонус за выход, переход на stage+1 (rising-water.md §6.1)', () => {
  it('касание дома: игрок замирает, надпись, рестарт stage+1 через STAGE_CLEAR_DELAY_MS', () => {
    const scene = { restart: vi.fn() };
    const stubs = stageClearStubs();
    stubs.time.delayedCall = vi.fn();
    const fakeThis = {
      elapsedSeconds: 10,
      water: { heightRows: 60, speedRowsPerSec: 1 },
      stageNumber: 2,
      score: 0,
      lives: 3,
      eventBus: { emit: vi.fn() },
      scene,
      ...stubs,
    };

    proto.handleExitReached.call(fakeThis);

    expect(fakeThis.stageCleared).toBe(true);
    expect(stubs.freezeForStageClear).toHaveBeenCalledTimes(1);
    expect(stubs.drawStageClearBanner).toHaveBeenCalledTimes(1);
    expect(STAGE_CLEAR_DELAY_MS).toBe(3000);
    expect(stubs.time.delayedCall).toHaveBeenCalledWith(STAGE_CLEAR_DELAY_MS, expect.any(Function));
    // До срабатывания таймера следующий этап не стартует.
    expect(scene.restart).not.toHaveBeenCalled();
    const [, callback] = stubs.time.delayedCall.mock.calls[0] as [number, () => void];
    callback();
    expect(scene.restart).toHaveBeenCalledWith({ stage: 3, lives: 3, score: fakeThis.score });
  });

  it('повторное касание дома (overlap каждый кадр) не даёт второй бонус и второй таймер', () => {
    const eventBus = { emit: vi.fn() };
    const stubs = stageClearStubs();
    stubs.time.delayedCall = vi.fn();
    const fakeThis = {
      elapsedSeconds: 10,
      water: { heightRows: 60, speedRowsPerSec: 1 },
      stageNumber: 1,
      score: 0,
      lives: 3,
      eventBus,
      scene: { restart: vi.fn() },
      ...stubs,
    };

    proto.handleExitReached.call(fakeThis);
    const scoreAfterFirst = fakeThis.score;
    proto.handleExitReached.call(fakeThis);
    proto.handleExitReached.call(fakeThis);

    expect(fakeThis.score).toBe(scoreAfterFirst);
    expect(stubs.time.delayedCall).toHaveBeenCalledTimes(1);
    expect(eventBus.emit.mock.calls.filter(([name]) => name === 'level:completed')).toHaveLength(1);
  });

  it('надпись — лацинка: PIERAMOHA! и ETAP N PROJDZIENY', () => {
    expect(STAGE_CLEAR_TITLE).toBe('PIERAMOHA!');
    expect(stageClearSubtitle(4)).toBe('ETAP 4 PROJDZIENY');
  });

  it('exitBonus = 100*n + 10*secondsLeft; emits score:changed, level:completed; scene.restart({stage:n+1,...})', () => {
    const eventBus = { emit: vi.fn() };
    const scene = { restart: vi.fn() };
    // Выход сразу после конца задержки (activeWaterSeconds=0) -> secondsLeft = T(n) - 0 = T(n).
    const heightRows = 60;
    const speedRowsPerSec = 1; // T(n) = heightRows/speed = 60с
    const fakeThis = {
      elapsedSeconds: WATER_START_DELAY_SECONDS, // t_exit == W_DELAY -> activeWaterSeconds=0
      water: { heightRows, speedRowsPerSec },
      stageNumber: 3,
      score: 50,
      lives: 2,
      eventBus,
      scene,
      ...stageClearStubs(),
    };

    proto.handleExitReached.call(fakeThis);

    const expectedBonus = Math.round(100 * 3 + 10 * 60); // secondsLeft=60
    expect(fakeThis.score).toBe(50 + expectedBonus);
    expect(eventBus.emit).toHaveBeenCalledWith('score:changed', { score: 50 + expectedBonus });
    expect(eventBus.emit).toHaveBeenCalledWith(
      'level:completed',
      expect.objectContaining({ levelId: 'rising-water' }),
    );
    expect(scene.restart).toHaveBeenCalledWith({ stage: 4, lives: 2, score: 50 + expectedBonus });
  });

  it('secondsLeft не уходит в отрицательное значение (clamp 0), если вода уже прошла весь этап к моменту выхода', () => {
    const eventBus = { emit: vi.fn() };
    const scene = { restart: vi.fn() };
    const heightRows = 60;
    const speedRowsPerSec = 1; // T(n)=60с
    const fakeThis = {
      // activeWaterSeconds = elapsed - W_DELAY = 500 -> сильно больше T(n)=60
      elapsedSeconds: WATER_START_DELAY_SECONDS + 500,
      water: { heightRows, speedRowsPerSec },
      stageNumber: 1,
      score: 0,
      eventBus,
      scene,
      ...stageClearStubs(),
    };

    proto.handleExitReached.call(fakeThis);

    const expectedBonus = Math.round(100 * 1 + 10 * 0);
    expect(fakeThis.score).toBe(expectedBonus);
  });

  it('согласуется с waterSpeedRowsPerSec(n) реального difficulty.ts для этапа 1 (T(1)=120с)', () => {
    const eventBus = { emit: vi.fn() };
    const scene = { restart: vi.fn() };
    const speed = waterSpeedRowsPerSec(1); // H(1)/T(1) = 60/120 = 0.5
    const fakeThis = {
      elapsedSeconds: WATER_START_DELAY_SECONDS + 20, // 20с воды прошло из T(1)=120с
      water: { heightRows: 60, speedRowsPerSec: speed },
      stageNumber: 1,
      score: 0,
      eventBus,
      scene,
      ...stageClearStubs(),
    };

    proto.handleExitReached.call(fakeThis);

    const secondsLeft = 120 - 20; // T(1) - activeWaterSeconds
    const expectedBonus = Math.round(100 * 1 + 10 * secondsLeft);
    expect(fakeThis.score).toBe(expectedBonus);
  });
});

/**
 * update() — интеграционный узел: пауза, вода, дрон, счёт, HUD. Вызываем
 * приватные геометрические/учётные методы через ту же ссылку на прототип
 * (proto.trackRowScore и т.д.), что и остальной файл — это реальный код
 * update(), не его копия.
 */
function makeUpdateFakeThis(overrides: {
  paused?: boolean;
  pausePressed?: boolean;
  grounded?: boolean;
  waterSurfaceRow?: number;
  drowned?: boolean;
  playerY?: number;
  lives?: number;
} = {}) {
  const eventBus = { emit: vi.fn() };
  const scene = { restart: vi.fn(), start: vi.fn() };
  const worldPause = vi.fn();
  const worldResume = vi.fn();
  const waterUpdate = vi.fn();
  const player = {
    y: overrides.playerY ?? 0,
    isGrounded: vi.fn(() => overrides.grounded ?? true),
    update: vi.fn(),
  };
  // justPressed — edge-triggered в реальном InputManager (истинно ровно один
  // кадр). pausePressedQueue.shift() имитирует это: overrides.pausePressed
  // управляет только ПЕРВЫМ вызовом update(), дальше — false, если тест не
  // передал больше значений явно через pausePressedQueue.
  const pausePressedQueue: boolean[] = overrides.pausePressed ? [true] : [];
  const inputManager = {
    setGrounded: vi.fn(),
    update: vi.fn(),
    state: {
      justPressed: (action: string) => (action === 'PAUSE' ? !!pausePressedQueue.shift() : false),
    },
  };
  const fakeThis: Record<string, unknown> = {
    stage: { heightRows: 60 },
    scale: { width: 960, height: 540 },
    paused: overrides.paused ?? false,
    inputManager,
    physics: { world: { pause: worldPause, resume: worldResume } },
    water: {
      update: waterUpdate,
      isDrowned: vi.fn(() => overrides.drowned ?? false),
      surfaceRow: overrides.waterSurfaceRow ?? 0,
    },
    elapsedSeconds: 0,
    player,
    eventBus,
    scene,
    lives: overrides.lives ?? 3,
    stageNumber: 1,
    score: 0,
    maxRowReached: 0,
    lastWaterDistanceRows: -1,
    waterGraphics: makeFakeGraphics(),
    time: { now: 0 },
    // Реальные методы прототипа — та же логика, что выполняется в игре.
    rowToPhaserTopRow: proto.rowToPhaserTopRow,
    rowToPixelY: proto.rowToPixelY,
    footRowToCenterPixelY: proto.footRowToCenterPixelY,
    centerPixelYToFootRow: proto.centerPixelYToFootRow,
    blockWidth: proto.blockWidth,
    blockHeight: proto.blockHeight,
    trackRowScore: proto.trackRowScore,
    updateWaterHud: proto.updateWaterHud,
    drawWater: proto.drawWater,
    loseLife: proto.loseLife,
  };
  return { fakeThis, eventBus, scene, worldPause, worldResume, waterUpdate, player, inputManager };
}

describe('PlatformerScene.update — пауза замораживает воду и физическую логику', () => {
  it('первое нажатие PAUSE ставит на паузу: physics.world.pause() вызван, water.update НЕ вызван в этом же кадре', () => {
    const { fakeThis, worldPause, waterUpdate } = makeUpdateFakeThis({ pausePressed: true });

    proto.update.call(fakeThis, 0, 16);

    expect(worldPause).toHaveBeenCalledTimes(1);
    expect(waterUpdate).not.toHaveBeenCalled();
  });

  it('пока пауза активна (без повторного PAUSE), водa не двигается ни на одном последующем кадре', () => {
    const { fakeThis, waterUpdate } = makeUpdateFakeThis({ pausePressed: true });
    proto.update.call(fakeThis, 0, 16); // включили паузу
    waterUpdate.mockClear();

    proto.update.call(fakeThis, 16, 16); // ещё кадр, PAUSE не нажат, но paused уже true
    proto.update.call(fakeThis, 32, 16);

    expect(waterUpdate).not.toHaveBeenCalled();
  });

  it('повторное нажатие PAUSE снимает паузу: physics.world.resume() вызван, water.update вызывается снова в том же кадре', () => {
    const { fakeThis, worldResume, waterUpdate } = makeUpdateFakeThis({ paused: true, pausePressed: true });

    proto.update.call(fakeThis, 0, 16);

    expect(worldResume).toHaveBeenCalledTimes(1);
    expect(waterUpdate).toHaveBeenCalledTimes(1);
  });

  it('без паузы water.update вызывается каждый кадр с dtSec = delta/1000 (с учётом MAX_DELTA_MS=100 клампа)', () => {
    const { fakeThis, waterUpdate } = makeUpdateFakeThis();

    proto.update.call(fakeThis, 0, 16);
    expect(waterUpdate).toHaveBeenCalledWith(0.016);

    waterUpdate.mockClear();
    proto.update.call(fakeThis, 16, 5000); // огромный delta (вкладка была в фоне)
    expect(waterUpdate).toHaveBeenCalledWith(0.1); // clamp на MAX_DELTA_MS=100мс
  });
});

describe('PlatformerScene.update — утопление вызывает реальный loseLife()', () => {
  it('когда water.isDrowned(footRow) === true, update() вызывает this.loseLife(): жизнь минус 1, lives:changed эмитится', () => {
    const { fakeThis, eventBus } = makeUpdateFakeThis({ drowned: true, lives: 3 });

    proto.update.call(fakeThis, 0, 16);

    expect(fakeThis['lives']).toBe(2);
    expect(eventBus.emit).toHaveBeenCalledWith('lives:changed', { lives: 2 });
  });

  it('утопление с последней жизнью приводит к game:over и scene.start("GameOverScene", ...)', () => {
    const { fakeThis, eventBus, scene } = makeUpdateFakeThis({ drowned: true, lives: 1 });

    proto.update.call(fakeThis, 0, 16);

    expect(fakeThis['lives']).toBe(0);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'game:over',
      expect.objectContaining({ levelId: 'rising-water', stageReached: 1 }),
    );
    expect(scene.start).toHaveBeenCalledWith('GameOverScene', expect.anything());
  });

  it('без утопления (isDrowned=false) loseLife НЕ вызывается — lives не меняется', () => {
    const { fakeThis, eventBus } = makeUpdateFakeThis({ drowned: false, lives: 3 });

    proto.update.call(fakeThis, 0, 16);

    expect(fakeThis['lives']).toBe(3);
    expect(eventBus.emit).not.toHaveBeenCalledWith('lives:changed', expect.anything());
  });
});

describe('PlatformerScene — подписка на resize снимается при SHUTDOWN', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create() регистрирует ровно один обработчик resize', () => {
    const { fakeScene, scale } = makeFakeScene();

    proto.create.call(fakeScene);

    expect(scale.listenerCount('resize')).toBe(1);
  });

  it('SHUTDOWN снимает подписку — после него listenerCount("resize") === 0', () => {
    const { fakeScene, scale, events } = makeFakeScene();

    proto.create.call(fakeScene);
    expect(scale.listenerCount('resize')).toBe(1);

    events.triggerShutdown();

    expect(scale.listenerCount('resize')).toBe(0);
  });

  it('после SHUTDOWN резиз окна больше не вызывает обработчик сцены (нет TypeError на уничтоженном physics.world)', () => {
    const { fakeScene, scale, events } = makeFakeScene();
    proto.create.call(fakeScene);
    events.triggerShutdown();

    (fakeScene['physics'] as { world: unknown }).world = null;

    expect(() => scale.emit('resize', { width: 100, height: 100 }, {}, {}, 960, 540)).not.toThrow();
  });

  it('цикл create → shutdown → create (рестарт уровня) не накапливает обработчики: остаётся ровно 1', () => {
    const { fakeScene, scale, events } = makeFakeScene();

    proto.create.call(fakeScene);
    expect(scale.listenerCount('resize')).toBe(1);

    events.triggerShutdown();
    expect(scale.listenerCount('resize')).toBe(0);

    proto.create.call(fakeScene);
    expect(scale.listenerCount('resize')).toBe(1); // не 2

    events.triggerShutdown();
    expect(scale.listenerCount('resize')).toBe(0);
  });

  it('create() эмитит stage:changed/score:changed/lives:changed через eventBus и создаёт этап через реальный generateStage', () => {
    const eventBusEmit = vi.fn();
    const { fakeScene } = makeFakeScene(eventBusEmit);
    (fakeScene as { stageNumber?: number }).stageNumber = 2;
    (fakeScene as { lives?: number }).lives = 3;
    (fakeScene as { score?: number }).score = 0;

    proto.create.call(fakeScene);

    expect(eventBusEmit).toHaveBeenCalledWith('stage:changed', { stage: 2 });
    expect((fakeScene as { stage?: ReturnType<typeof generateStage> }).stage?.heightRows).toBe(
      generateStage(2).heightRows,
    );
  });
});
