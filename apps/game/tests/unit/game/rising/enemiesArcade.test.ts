import '../../../setup/canvas-stub';
import { describe, expect, it, vi } from 'vitest';

// См. arcadePlaythrough.test.ts: в Node подменяем 'phaser' на готовый дистрибутив.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<{ default?: unknown }>('phaser/dist/phaser.js');
  return { default: actual.default ?? actual };
});

import Phaser from 'phaser';
import {
  GRID_COLUMNS,
  PLAYER_HITBOX_HEIGHT_BLOCKS,
  PLAYER_HITBOX_WIDTH_BLOCKS,
  WORLD_GRAVITY_COEFFICIENT,
} from '@/game/dimensions';
import { ENEMY_FRAME_COUNT, enemyTextureKey, Enemies } from '@/game/entities/Enemies';
import { ENEMY_FRAME_PX, ENEMY_KINDS, placeEnemies } from '@/game/rising/enemies';
import type { PlatformSpec, Stage } from '@/game/rising/stageGenerator';

/**
 * Враги на НАСТОЯЩЕЙ Arcade Physics (Phaser.HEADLESS, кадры шагаем сами,
 * как в arcadePlaythrough.test.ts). Проверяем то, чего не видно в чистой
 * модели: неподвижное для столкновений тело, двигаясь, действительно
 * толкает стоящего игрока и сталкивает его с платформы — и при этом не
 * проталкивает сквозь платформу и не застревает в нём.
 *
 * Враги — настоящий класс Enemies из игры; платформы и игрок устроены как в
 * arcadePlaythrough.test.ts (статические блоки 1×1, хитбокс игрока из
 * dimensions.ts, гравитация из коэффициента).
 */

const BLOCK = 32;
const HEIGHT_ROWS = 24;
/** Частоты экрана: физика всегда 60 Гц, а кадры отрисовки — как у монитора. */
const DISPLAY_HZ = [60, 120] as const;

class PushScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Zone;
  enemies!: Enemies;

  constructor() {
    super('Push');
  }

  rowToPixelY(row: number): number {
    return (HEIGHT_ROWS - 1 - row) * BLOCK;
  }

  build(stage: Stage, playerX: number, playerRow: number): void {
    this.physics.world.setBounds(0, 0, GRID_COLUMNS * BLOCK, HEIGHT_ROWS * BLOCK);
    this.physics.world.checkCollision.down = false;
    this.physics.world.gravity.y = BLOCK * WORLD_GRAVITY_COEFFICIENT;

    const blocks: Phaser.GameObjects.Zone[] = [];
    for (const spec of [{ x: 0, row: 0, width: GRID_COLUMNS }, ...stage.platforms, stage.exit]) {
      for (let c = 0; c < spec.width; c++) {
        const block = this.add.zone((spec.x + c + 0.5) * BLOCK, this.rowToPixelY(spec.row) + BLOCK / 2, BLOCK, BLOCK);
        this.physics.add.existing(block, true);
        blocks.push(block);
      }
    }

    this.enemies = new Enemies(this, stage, (row) => this.rowToPixelY(row));
    this.enemies.layout(BLOCK, BLOCK);

    this.player = this.add.zone(0, 0, BLOCK * PLAYER_HITBOX_WIDTH_BLOCKS, BLOCK * PLAYER_HITBOX_HEIGHT_BLOCKS);
    this.physics.add.existing(this.player);
    const body = this.playerBody();
    body.setCollideWorldBounds(true);
    body.setBounce(0.05, 0);
    body.reset(playerX * BLOCK, this.rowToPixelY(playerRow) - (BLOCK * PLAYER_HITBOX_HEIGHT_BLOCKS) / 2 - 1);
    this.physics.add.collider(this.player, blocks);
    this.physics.add.collider(this.player, this.enemies.group);
  }

  playerBody(): Phaser.Physics.Arcade.Body {
    return this.player.body as Phaser.Physics.Arcade.Body;
  }

  /** Ряд, на котором ноги игрока. */
  playerFootRow(): number {
    return HEIGHT_ROWS - 1 - this.playerBody().bottom / BLOCK;
  }

  override update(): void {
    // Игрок стоит (без ввода), как Player.update при отпущенных клавишах.
    // Враги двигаются сами, на шагах физики (Enemies.onWorldStep).
    if (this.player) this.playerBody().setVelocityX(0);
  }
}

function bootGame(displayHz = 60): { game: Phaser.Game; scene: PushScene; step: () => void } {
  const frameMs = 1000 / displayHz;
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: GRID_COLUMNS * BLOCK,
    height: 18 * BLOCK,
    banner: false,
    audio: { noAudio: true },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
    scene: [PushScene],
  });
  for (const key of ['__DEFAULT', '__MISSING', '__WHITE']) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    game.textures.addCanvas(key, canvas);
  }
  // Листы врагов с кадрами '0'..'N-1', как PreloadScene.registerEnemyFrames.
  for (const kind of ENEMY_KINDS) {
    const canvas = document.createElement('canvas');
    canvas.width = ENEMY_FRAME_PX * ENEMY_FRAME_COUNT;
    canvas.height = ENEMY_FRAME_PX;
    const texture = game.textures.addCanvas(enemyTextureKey(kind), canvas)!;
    for (let f = 0; f < ENEMY_FRAME_COUNT; f++) {
      texture.add(String(f), 0, f * ENEMY_FRAME_PX, 0, ENEMY_FRAME_PX, ENEMY_FRAME_PX);
    }
  }
  game.textures.emit(Phaser.Textures.Events.READY);
  game.loop.stop();
  let time = 1000;
  const step = (): void => {
    time += frameMs;
    game.headlessStep(time, frameMs);
  };
  step();
  return { game, scene: game.scene.getScene('Push') as PushScene, step };
}

function makeStage(n: number, platforms: PlatformSpec[]): Stage {
  return {
    n,
    heightRows: HEIGHT_ROWS,
    platformWidth: 6,
    platforms,
    spawn: { x: 2 },
    exit: { x: 24, row: 20, width: 4 },
  };
}

/** Насколько глубоко (в пикселях) игрок залез внутрь блока платформы. */
function penetrationPx(scene: PushScene, platforms: PlatformSpec[]): number {
  const b = scene.playerBody();
  let worst = 0;
  for (const p of platforms) {
    const left = p.x * BLOCK;
    const right = (p.x + p.width) * BLOCK;
    const top = scene.rowToPixelY(p.row);
    const bottom = top + BLOCK;
    const ox = Math.min(b.right, right) - Math.max(b.left, left);
    const oy = Math.min(b.bottom, bottom) - Math.max(b.top, top);
    if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
  }
  return worst;
}

describe('Враги на Arcade Physics — толкают, но не ломают физику', () => {
  it.each(DISPLAY_HZ)('на экране %i Гц Пнявік идёт ровно, без рывков назад (не «двоится»)', (hz) => {
    const platforms: PlatformSpec[] = [
      { x: 2, row: 3, width: 6 },
      { x: 12, row: 6, width: 6 },
      { x: 4, row: 10, width: 8 },
    ];
    const { game, scene, step } = bootGame(hz);
    try {
      // Игрок далеко внизу, пень ходит свободно.
      scene.build(makeStage(3, platforms), 20, 0);
      const stump = scene.enemies.group.getChildren()[0] as Phaser.Physics.Arcade.Sprite;
      const xs: number[] = [];
      for (let i = 0; i < hz * 12; i++) {
        step();
        xs.push(stump.x);
      }
      // Разворотов (смен знака шага) — только у краёв платформы: за 12 с при
      // 1.5 блок/с и ходе ≈7.6 блока это 2–3 разворота, не десятки.
      let reversals = 0;
      let prevDir = 0;
      for (let i = 1; i < xs.length; i++) {
        const dx = xs[i]! - xs[i - 1]!;
        if (Math.abs(dx) < 1e-6) continue;
        const dir = Math.sign(dx);
        if (prevDir !== 0 && dir !== prevDir) reversals += 1;
        prevDir = dir;
      }
      expect(reversals).toBeLessThanOrEqual(3);
      // И ни одного шага длиннее, чем проходит за шаг физики.
      const maxStep = Math.max(...xs.slice(1).map((x, i) => Math.abs(x - xs[i]!)));
      expect(maxStep).toBeLessThanOrEqual((1.5 * BLOCK) / 60 + 0.01);
    } finally {
      game.destroy(true);
    }
  });

  it('Пнявік сталкивает стоящего игрока с платформы', () => {
    // Этап 3: Пнявік на третьей платформе (номер 2).
    const platforms: PlatformSpec[] = [
      { x: 2, row: 3, width: 6 },
      { x: 12, row: 6, width: 6 },
      { x: 4, row: 10, width: 8 },
    ];
    const stage = makeStage(3, platforms);
    expect(placeEnemies(stage).map((e) => e.kind)).toEqual(['stump']);

    const { game, scene, step } = bootGame();
    try {
      scene.build(stage, 8, 10);
      let fell = false;
      let worstPenetration = 0;
      for (let i = 0; i < 60 * 15 && !fell; i++) {
        step();
        worstPenetration = Math.max(worstPenetration, penetrationPx(scene, platforms));
        expect(Number.isFinite(scene.playerBody().x)).toBe(true);
        if (scene.playerFootRow() < 10 - 1.5) fell = true;
      }
      expect(fell, 'Пнявік должен столкнуть игрока с края платформы').toBe(true);
      expect(worstPenetration, 'игрок не должен проваливаться в платформу').toBeLessThan(3);
    } finally {
      game.destroy(true);
    }
  });

  it('Карчок пролетает сквозь ряд, где стоит игрок, толкает его и не вдавливает в платформу', () => {
    // Этап 10: Карчок между платформами 1 и 2 (ряд 6.5), игрок стоит на платформе 1.
    const platforms: PlatformSpec[] = [
      { x: 2, row: 3, width: 6 },
      { x: 10, row: 6, width: 12 },
      { x: 24, row: 8, width: 6 },
    ];
    const stage = makeStage(10, platforms);
    const kinds = placeEnemies(stage).map((e) => e.kind);
    expect(kinds).toContain('roots');

    const { game, scene, step } = bootGame();
    try {
      scene.build(stage, 16, 6);
      const startX = scene.playerBody().center.x;
      let moved = false;
      let worstPenetration = 0;
      for (let i = 0; i < 60 * 15; i++) {
        step();
        worstPenetration = Math.max(worstPenetration, penetrationPx(scene, platforms));
        expect(Number.isFinite(scene.playerBody().y)).toBe(true);
        if (Math.abs(scene.playerBody().center.x - startX) > BLOCK / 2) moved = true;
      }
      expect(moved, 'Карчок должен толкнуть игрока').toBe(true);
      expect(worstPenetration, 'игрок не должен проваливаться в платформу').toBeLessThan(3);
    } finally {
      game.destroy(true);
    }
  });
});
