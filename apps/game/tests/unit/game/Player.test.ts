import '../../setup/canvas-stub';
import { describe, expect, it, vi } from 'vitest';

/**
 * `import Phaser from 'phaser'` resolves (Node/vitest "main" field) to
 * `phaser/src/phaser.js` — исходники, не webpack-сборка. Тот файл содержит
 * `if (typeof WEBGL_DEBUG) { require('phaser3spectorjs') }` (см.
 * renderer/webgl/WebGLRenderer.js:32-35): `typeof <неопределённая переменная>`
 * в JS всегда возвращает строку `"undefined"` — непустую, то есть ИСТИННУЮ по
 * правилам truthiness, поэтому ветка выполняется всегда, а `phaser3spectorjs`
 * (debug-инструмент, devDependency самого пакета phaser, не рантайм-зависимость
 * потребителей) не установлен -> `Cannot find module`. В браузерной сборке
 * Next.js это не проявляется — webpack берёт `"browser": "./dist/phaser.js"`
 * (уже собранный бандл, где эта ветка вырезана на этапе сборки самого Phaser).
 * Реализуем тот же выбор здесь: подменяем 'phaser' на готовый дистрибутив.
 */
vi.mock('phaser', async () => {
  const actual = await vi.importActual<{ default?: unknown }>('phaser/dist/phaser.js');
  return { default: actual.default ?? actual };
});

import { Player } from '@/game/entities/Player';
import {
  PLAYER_HITBOX_HEIGHT_PX,
  PLAYER_HITBOX_OFFSET_X_PX,
  PLAYER_HITBOX_OFFSET_Y_PX,
  PLAYER_HITBOX_WIDTH_PX,
  PLAYER_JUMP_VELOCITY_COEFFICIENT,
  WORLD_GRAVITY_COEFFICIENT,
} from '@/game/dimensions';

type PlayerProto = { applyHitboxOffset: () => void };
const applyHitboxOffset = (Player.prototype as unknown as PlayerProto).applyHitboxOffset;

/**
 * Player extends Phaser.Physics.Arcade.Sprite — реальный конструктор требует
 * живую Phaser.Scene с текстурным менеджером, которой в jsdom нет (см.
 * комментарий в vitest.config.ts: WebGL/канвас-рендер не тестируются юнит-
 * тестами). resizeForGrid()/update() при этом не используют состояние из
 * конструктора — вызываем их как несвязанные методы прототипа с "fake this",
 * реализующим ровно ту часть Phaser API, которую они читают. Это тестирует
 * настоящий код методов, а не переписанную копию логики.
 */
describe('Player.resizeForGrid — фикс двойного масштабирования хитбокса (level-design.md §5.3)', () => {
  it('body.setSize получает размер хитбокса в пикселях кадра, а не в блоках', () => {
    const setDisplaySize = vi.fn();
    const setSize = vi.fn();
    const fakeThis = {
      setDisplaySize,
      body: { setSize, setOffset: vi.fn() },
      flipX: false,
      applyHitboxOffset,
    };

    const blockWidth = 60;
    const blockHeight = 60;
    (Player.prototype.resizeForGrid as (this: unknown, bw: number, bh: number) => void).call(
      fakeThis,
      blockWidth,
      blockHeight,
    );

    // setDisplaySize по-прежнему получает целевой блочный размер спрайта.
    expect(setDisplaySize).toHaveBeenCalledWith(blockWidth, blockHeight * 1.5);

    // Баг из level-design.md §5.3: Arcade Body.setSize() сам умножает
    // аргументы на scaleX/scaleY спрайта — поэтому сюда передаются пиксели
    // кадра, а не blockWidth/blockHeight. И хитбокс — ноги и корпус девочки,
    // а не весь кадр 32×48 (иначе игрок «стоит в воздухе» у края платформы).
    expect(setSize).toHaveBeenCalledWith(PLAYER_HITBOX_WIDTH_PX, PLAYER_HITBOX_HEIGHT_PX, false);
    expect(PLAYER_HITBOX_WIDTH_PX).toBeLessThan(32);
  });

  it('вызов идемпотентен по значениям при повторном вызове с теми же аргументами', () => {
    const setSize = vi.fn();
    const fakeThis = { setDisplaySize: vi.fn(), body: { setSize, setOffset: vi.fn() }, flipX: false, applyHitboxOffset };

    (Player.prototype.resizeForGrid as (this: unknown, bw: number, bh: number) => void).call(
      fakeThis,
      45,
      45,
    );
    (Player.prototype.resizeForGrid as (this: unknown, bw: number, bh: number) => void).call(
      fakeThis,
      45,
      45,
    );

    expect(setSize).toHaveBeenNthCalledWith(1, PLAYER_HITBOX_WIDTH_PX, PLAYER_HITBOX_HEIGHT_PX, false);
    expect(setSize).toHaveBeenNthCalledWith(2, PLAYER_HITBOX_WIDTH_PX, PLAYER_HITBOX_HEIGHT_PX, false);
  });
});

describe('Player — хитбокс по нарисованной девочке, зеркалится при повороте', () => {
  it('смотрит вправо: хитбокс на ногах (x 13..25), низ = низ кадра', () => {
    const setOffset = vi.fn();
    applyHitboxOffset.call({ flipX: false, body: { setOffset } });
    expect(setOffset).toHaveBeenCalledWith(PLAYER_HITBOX_OFFSET_X_PX, PLAYER_HITBOX_OFFSET_Y_PX);
    expect(PLAYER_HITBOX_OFFSET_Y_PX + PLAYER_HITBOX_HEIGHT_PX).toBe(48);
  });

  it('смотрит влево: смещение зеркальное, 32 − 13 − 12 = 7', () => {
    const setOffset = vi.fn();
    applyHitboxOffset.call({ flipX: true, body: { setOffset } });
    expect(setOffset).toHaveBeenCalledWith(32 - PLAYER_HITBOX_OFFSET_X_PX - PLAYER_HITBOX_WIDTH_PX, PLAYER_HITBOX_OFFSET_Y_PX);
  });

  it('хитбокс не выходит за ноги девочки в кадре стояния (ноги x 13..24 из sprite.svg)', () => {
    expect(PLAYER_HITBOX_OFFSET_X_PX).toBe(13);
    expect(PLAYER_HITBOX_OFFSET_X_PX + PLAYER_HITBOX_WIDTH_PX).toBeLessThanOrEqual(25);
  });
});

describe('Player.update — коэффициенты прыжка/гравитации, применённые к blockHeight', () => {
  function makeFakeInputManager(overrides: {
    moveX?: number;
    jumpPressed?: boolean;
    jumpReleased?: boolean;
  }) {
    return {
      state: {
        moveX: overrides.moveX ?? 0,
        justPressed: (action: string) => (action === 'JUMP' ? !!overrides.jumpPressed : false),
        justReleased: (action: string) => (action === 'JUMP' ? !!overrides.jumpReleased : false),
      },
    };
  }

  /**
   * update() читает this.isGrounded() (реальный метод прототипа, вызывает
   * body.blocked.down || body.touching.down — см. Player.ts:71-73), this.play()
   * (анимации), this.setFlipX() и this.scene.sound.play('jump-sound') — все
   * они отсутствуют в примитивном fakeThis, поэтому вызов "как есть" падает
   * с `this.isGrounded is not a function` (баг тестового фикстура, не кода
   * Player.ts — см. отчёт волны D). Этот билдер даёт полный набор fake-полей,
   * которые update() реально читает/пишет.
   */
  function makeFakeThis(overrides: {
    width?: number;
    height?: number;
    velocityY?: number;
    grounded?: boolean;
  } = {}) {
    const width = overrides.width ?? 960;
    const height = overrides.height ?? 540;
    const setVelocityX = vi.fn();
    const setVelocityY = vi.fn();
    const play = vi.fn();
    const setFlipX = vi.fn();
    const soundPlay = vi.fn();
    const isGrounded = vi.fn(() => overrides.grounded ?? true);
    const fakeThis = {
      scene: { scale: { width, height }, sound: { play: soundPlay } },
      body: { setVelocityX, setVelocityY, velocity: { y: overrides.velocityY ?? 0 } },
      isGrounded,
      play,
      setFlipX,
    };
    return { fakeThis, setVelocityX, setVelocityY, play, setFlipX, soundPlay, isGrounded };
  }

  function callUpdate(fakeThis: unknown, inputManager: unknown): void {
    (Player.prototype.update as (this: unknown, im: unknown) => void).call(fakeThis, inputManager);
  }

  it('прыжок задаёт вертикальную скорость = -(blockHeight * 25), т.е. PLAYER_JUMP_VELOCITY_COEFFICIENT', () => {
    const { fakeThis, setVelocityY } = makeFakeThis(); // blockHeight = 540/18 = 30
    callUpdate(fakeThis, makeFakeInputManager({ jumpPressed: true }));

    const expectedBlockHeight = 540 / 18;
    expect(setVelocityY).toHaveBeenCalledWith(-(expectedBlockHeight * PLAYER_JUMP_VELOCITY_COEFFICIENT));
    expect(setVelocityY).toHaveBeenCalledWith(-750); // 30 * 25
  });

  it('прыжок проигрывает "jump-sound" через this.scene.sound.play', () => {
    const { fakeThis, soundPlay } = makeFakeThis();
    callUpdate(fakeThis, makeFakeInputManager({ jumpPressed: true }));

    expect(soundPlay).toHaveBeenCalledWith('jump-sound');
  });

  it('коэффициент прыжка масштабируется вместе с размером канвы (не абсолютное число пикселей)', () => {
    const { fakeThis, setVelocityY } = makeFakeThis({ width: 1920, height: 1080 }); // blockHeight = 60
    callUpdate(fakeThis, makeFakeInputManager({ jumpPressed: true }));

    expect(setVelocityY).toHaveBeenCalledWith(-1500); // 60 * 25
  });

  it('короткий прыжок (justReleased во время подъёма) обрезает скорость множителем 0.5', () => {
    const { fakeThis, setVelocityY } = makeFakeThis({ velocityY: -750 });
    callUpdate(fakeThis, makeFakeInputManager({ jumpReleased: true }));

    expect(setVelocityY).toHaveBeenCalledWith(-375); // -750 * 0.5
  });

  it('короткий прыжок не применяется, если игрок уже падает (velocity.y >= 0)', () => {
    const { fakeThis, setVelocityY } = makeFakeThis({ velocityY: 100 });
    callUpdate(fakeThis, makeFakeInputManager({ jumpReleased: true }));

    expect(setVelocityY).not.toHaveBeenCalled();
  });

  it('в воздухе (isGrounded()=false) проигрывает "girl-jump" при подъёме (velocity.y < 0)', () => {
    const { fakeThis, play } = makeFakeThis({ grounded: false, velocityY: -100 });
    callUpdate(fakeThis, makeFakeInputManager({}));

    expect(play).toHaveBeenCalledWith('girl-jump', true);
  });

  it('в воздухе (isGrounded()=false) проигрывает "girl-fall" при падении (velocity.y >= 0)', () => {
    const { fakeThis, play } = makeFakeThis({ grounded: false, velocityY: 50 });
    callUpdate(fakeThis, makeFakeInputManager({}));

    expect(play).toHaveBeenCalledWith('girl-fall', true);
  });

  it('на земле (isGrounded()=true) с moveX!==0 проигрывает "girl-run"', () => {
    const { fakeThis, play } = makeFakeThis({ grounded: true });
    callUpdate(fakeThis, makeFakeInputManager({ moveX: 1 }));

    expect(play).toHaveBeenCalledWith('girl-run', true);
  });

  it('на земле (isGrounded()=true) с moveX===0 проигрывает "girl-idle"', () => {
    const { fakeThis, play } = makeFakeThis({ grounded: true });
    callUpdate(fakeThis, makeFakeInputManager({ moveX: 0 }));

    expect(play).toHaveBeenCalledWith('girl-idle', true);
  });

  it('moveX < 0 переворачивает спрайт (setFlipX(true)), moveX > 0 — возвращает (setFlipX(false))', () => {
    const left = makeFakeThis();
    callUpdate(left.fakeThis, makeFakeInputManager({ moveX: -1 }));
    expect(left.setFlipX).toHaveBeenCalledWith(true);
    expect(left.setFlipX).not.toHaveBeenCalledWith(false);

    const right = makeFakeThis();
    callUpdate(right.fakeThis, makeFakeInputManager({ moveX: 1 }));
    expect(right.setFlipX).toHaveBeenCalledWith(false);
    expect(right.setFlipX).not.toHaveBeenCalledWith(true);
  });

  it('body.setVelocityX вызывается с moveX * moveSpeed (moveSpeed = blockWidth * PLAYER_MOVE_SPEED_BLOCKS_PER_SEC)', () => {
    const { fakeThis, setVelocityX } = makeFakeThis({ width: 960, height: 540 }); // blockWidth = 30
    callUpdate(fakeThis, makeFakeInputManager({ moveX: -1 }));

    const blockWidth = 960 / 32;
    expect(setVelocityX).toHaveBeenCalledWith(-1 * blockWidth * (220 / 32));
  });
});

describe('WORLD_GRAVITY_COEFFICIENT — использован согласованно с уровнем прыжка', () => {
  it('константа импортируемая PlatformerScene совпадает с выведенной в level-design.md (62.5)', () => {
    expect(WORLD_GRAVITY_COEFFICIENT).toBe(62.5);
  });
});
