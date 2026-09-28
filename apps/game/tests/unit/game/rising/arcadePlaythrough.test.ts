import '../../../setup/canvas-stub';
import { describe, expect, it, vi } from 'vitest';

// См. Player.test.ts: в Node 'phaser' резолвится в исходники, которые тянут
// отсутствующий debug-пакет; подменяем на готовый дистрибутив, как в браузере.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<{ default?: unknown }>('phaser/dist/phaser.js');
  return { default: actual.default ?? actual };
});

import Phaser from 'phaser';
import {
  GRID_COLUMNS,
  PLAYER_HITBOX_HEIGHT_BLOCKS,
  PLAYER_HITBOX_WIDTH_BLOCKS,
  PLAYER_JUMP_VELOCITY_COEFFICIENT,
  PLAYER_MOVE_SPEED_BLOCKS_PER_SEC,
  WORLD_GRAVITY_COEFFICIENT,
} from '@/game/dimensions';
import { findJumpStrategy, type JumpStrategy, type SimPlatform } from '@/game/rising/jumpSimulator';
import { housePlacement } from '@/game/rising/goal';
import { generateStage, SPAWN_ZONE_WIDTH, type Stage } from '@/game/rising/stageGenerator';

/**
 * Сквозное прохождение этапов на НАСТОЯЩЕЙ Arcade Physics Phaser 3.90, без
 * браузера: Phaser.HEADLESS в jsdom, кадры шагаем сами (headlessStep, 60 Гц).
 *
 * Зачем: симулятор (jumpSimulator.ts) — наша модель физики. Этот тест
 * проверяет, что найденные им тактики работают в самом движке, со всеми его
 * особенностями разрешения столкновений. Бот играет как человек: стартует на
 * земле, идёт к точке прыжка, прыгает, приземляется на платформу и идёт к
 * следующей — до выхода. Никаких телепортов.
 *
 * Повторяет игру: платформы собраны из статических тел 1×1 блок (как
 * Platform.ts, со швами между блоками), хитбокс игрока 1×1.5, гравитация и
 * скорость прыжка — коэффициенты из dimensions.ts, скорость ставится
 * мгновенно (Player.update), прыжок — только стоя на опоре (blocked/touching
 * down, как Player.isGrounded), нижняя граница мира открыта, потолок — граница
 * мира на ряду H−1. Управление применяется в scene.update(), то есть после
 * шага физики этого кадра — тот же порядок, что в PlatformerScene.
 */

const BLOCK = 32;
const HITBOX_W = PLAYER_HITBOX_WIDTH_BLOCKS;
const HITBOX_H = PLAYER_HITBOX_HEIGHT_BLOCKS;
const VIEW_ROWS = 18;
const FRAME_MS = 1000 / 60;

interface Keys {
  left: boolean;
  right: boolean;
  jump: boolean;
}

class PlaythroughScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Zone;
  keys: Keys = { left: false, right: false, jump: false };
  private jumpWasDown = false;

  constructor() {
    super('Playthrough');
  }

  build(stage: Stage): void {
    const worldHeight = stage.heightRows * BLOCK;
    this.physics.world.setBounds(0, 0, GRID_COLUMNS * BLOCK, worldHeight);
    this.physics.world.checkCollision.down = false;
    this.physics.world.gravity.y = BLOCK * WORLD_GRAVITY_COEFFICIENT;

    const specs = [{ x: 0, row: 0, width: GRID_COLUMNS }, ...stage.platforms, stage.exit];
    const blocks: Phaser.GameObjects.Zone[] = [];
    for (const spec of specs) {
      const phaserTopRow = stage.heightRows - 1 - spec.row;
      for (let c = 0; c < spec.width; c++) {
        const block = this.add.zone(
          (spec.x + c + 0.5) * BLOCK,
          (phaserTopRow + 0.5) * BLOCK,
          BLOCK,
          BLOCK,
        );
        this.physics.add.existing(block, true);
        blocks.push(block);
      }
    }

    // Хитбокс как в игре (dimensions.ts, PLAYER_HITBOX_*), а не весь спрайт.
    this.player = this.add.zone(0, 0, BLOCK * HITBOX_W, BLOCK * HITBOX_H);
    this.physics.add.existing(this.player);
    const body = this.playerBody();
    body.setCollideWorldBounds(true);
    body.setBounce(0.05, 0);
    this.physics.add.collider(this.player, blocks);
    this.placeOnRow((stage.spawn.x + 0.5) * BLOCK, 0, stage);
  }

  playerBody(): Phaser.Physics.Arcade.Body {
    return this.player.body as Phaser.Physics.Arcade.Body;
  }

  placeOnRow(centerXpx: number, row: number, stage: Stage): void {
    const bottomPx = (stage.heightRows - 1 - row) * BLOCK;
    this.playerBody().reset(centerXpx, bottomPx - (BLOCK * HITBOX_H) / 2 - 1);
  }

  isGrounded(): boolean {
    const body = this.playerBody();
    return body.blocked.down || body.touching.down;
  }

  override update(): void {
    if (!this.player) return; // сцена уже работает, этап ещё не построен
    const body = this.playerBody();
    const move = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    body.setVelocityX(move * BLOCK * PLAYER_MOVE_SPEED_BLOCKS_PER_SEC);
    const justPressed = this.keys.jump && !this.jumpWasDown;
    this.jumpWasDown = this.keys.jump;
    if (justPressed && this.isGrounded()) {
      body.setVelocityY(-BLOCK * PLAYER_JUMP_VELOCITY_COEFFICIENT);
    }
  }
}

function bootGame(): { game: Phaser.Game; scene: PlaythroughScene; step: () => void } {
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: GRID_COLUMNS * BLOCK,
    height: VIEW_ROWS * BLOCK,
    banner: false,
    audio: { noAudio: true },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 } } },
    scene: [PlaythroughScene],
  });
  // jsdom не грузит картинки: TextureManager никогда не сообщит о
  // готовности сам. Кладём заглушки базовых текстур и сообщаем вручную.
  for (const key of ['__DEFAULT', '__MISSING', '__WHITE']) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    game.textures.addCanvas(key, canvas);
  }
  game.textures.emit(Phaser.Textures.Events.READY);
  game.loop.stop();
  let time = 1000;
  const step = (): void => {
    time += FRAME_MS;
    game.headlessStep(time, FRAME_MS);
  };
  step();
  const scene = game.scene.getScene('Playthrough') as PlaythroughScene;
  return { game, scene, step };
}

interface Variant {
  name: string;
  takeoffShift: number;
  runDelayShift: number;
}

const VARIANTS: Variant[] = [
  { name: 'точная тактика', takeoffShift: 0, runDelayShift: 0 },
  // Игрок прыгнул на 0.25 блока дальше от B и начал бег на 0.1 с позже.
  { name: 'прыгнул раньше и опоздал с бегом', takeoffShift: 0.25, runDelayShift: 0.1 },
  // Игрок проскочил точку прыжка на 0.25 блока в сторону B.
  { name: 'проскочил точку прыжка', takeoffShift: -0.25, runDelayShift: 0 },
];

interface PlayResult {
  reachedExit: boolean;
  failedAt?: string;
}

function playStage(n: number, variant: Variant): PlayResult {
  const stage = generateStage(n);
  const { game, scene, step } = bootGame();
  try {
    scene.build(stage);
    const exit: SimPlatform = { ...stage.exit };
    const ceiling: SimPlatform = { x: -1, row: stage.heightRows, width: GRID_COLUMNS + 2 };
    const all: SimPlatform[] = [...stage.platforms, exit, ceiling];
    const chain: SimPlatform[] = [
      { x: stage.spawn.x, row: 0, width: SPAWN_ZONE_WIDTH },
      ...stage.platforms,
      exit,
    ];
    const xBlocks = (): number => scene.player.x / BLOCK;
    const footRow = (): number => stage.heightRows - 1 - scene.playerBody().bottom / BLOCK;

    const waitFor = (pred: () => boolean, maxFrames: number): boolean => {
      for (let f = 0; f < maxFrames; f++) {
        if (pred()) return true;
        step();
      }
      return pred();
    };

    // Даём игроку встать на землю.
    waitFor(() => scene.isGrounded(), 120);

    for (let i = 0; i < chain.length - 1; i++) {
      const A = chain[i]!;
      const B = chain[i + 1]!;
      const where = `этап ${n}, звено ${i} (ряд ${A.row.toFixed(2)} → ${B.row.toFixed(2)})`;
      const found: JumpStrategy | null = findJumpStrategy(A, B, all);
      if (!found) return { reachedExit: false, failedAt: `${where}: симулятор не нашёл тактику` };
      const strategy = {
        ...found,
        x0: found.x0 - found.dir * variant.takeoffShift,
        runDelay: found.runDelay + variant.runDelayShift,
      };

      // 1) Дойти по A до точки отрыва.
      const target = strategy.x0;
      const walkDir = xBlocks() < target ? 1 : -1;
      if (Math.abs(xBlocks() - target) > 0.1) {
        scene.keys.right = walkDir > 0;
        scene.keys.left = walkDir < 0;
        const arrived = waitFor(
          () => (walkDir > 0 ? xBlocks() >= target - 0.06 : xBlocks() <= target + 0.06),
          600,
        );
        scene.keys.left = scene.keys.right = false;
        if (!arrived) return { reachedExit: false, failedAt: `${where}: не дошёл до точки прыжка` };
      }
      step();
      step();
      if (!scene.isGrounded() || Math.abs(footRow() - A.row) > 0.1) {
        return {
          reachedExit: false,
          failedAt: `${where}: перед прыжком не стоит на A (ряд ${footRow().toFixed(2)})`,
        };
      }

      // 2) Прыжок по тактике.
      scene.keys.jump = true;
      if (!waitFor(() => scene.playerBody().velocity.y < 0, 5)) {
        return { reachedExit: false, failedAt: `${where}: прыжок не начался` };
      }
      let t = 0;
      let running = false;
      let stopped = false;
      let landed = false;
      for (let f = 0; f < 240; f++) {
        if (!running && !stopped && t >= strategy.runDelay - 1e-9) {
          scene.keys.right = strategy.dir > 0;
          scene.keys.left = strategy.dir < 0;
          running = true;
        }
        if (running && (strategy.dir > 0 ? xBlocks() >= strategy.stopX : xBlocks() <= strategy.stopX)) {
          scene.keys.left = scene.keys.right = false;
          running = false;
          stopped = true;
        }
        step();
        t += FRAME_MS / 1000;
        if (t > 0.1 && scene.playerBody().blocked.down) {
          landed = true;
          break;
        }
      }
      scene.keys.left = scene.keys.right = scene.keys.jump = false;
      step();

      const onB =
        landed &&
        Math.abs(footRow() - B.row) < 0.1 &&
        xBlocks() > B.x - 0.5 &&
        xBlocks() < B.x + B.width + 0.5;
      if (!onB) {
        return {
          reachedExit: false,
          failedAt: `${where}: не приземлился на B — ряд ${footRow().toFixed(2)}, x ${xBlocks().toFixed(2)}`,
        };
      }
    }

    // 3) Победа — только касание дома (rising/goal.ts): идём по платформе
    // выхода к дому, пока хитбокс игрока не заденет зону его стен.
    const { trigger } = housePlacement(stage.exit);
    const touchesHouse = (): boolean => {
      const feet = footRow();
      return (
        xBlocks() + HITBOX_W / 2 > trigger.x &&
        xBlocks() - HITBOX_W / 2 < trigger.x + trigger.width &&
        feet + HITBOX_H > trigger.bottomRow &&
        feet < trigger.bottomRow + trigger.heightRows
      );
    };
    const houseDir = xBlocks() < trigger.x + trigger.width / 2 ? 1 : -1;
    scene.keys.right = houseDir > 0;
    scene.keys.left = houseDir < 0;
    const reachedHouse = waitFor(touchesHouse, 300);
    scene.keys.left = scene.keys.right = false;
    if (!reachedHouse) {
      return {
        reachedExit: false,
        failedAt: `этап ${n}: не дошёл до дома — ряд ${footRow().toFixed(2)}, x ${xBlocks().toFixed(2)}`,
      };
    }
    return { reachedExit: true };
  } finally {
    game.destroy(true);
  }
}

describe('сквозное прохождение этапов 1–20 на настоящей Arcade Physics: от старта до дома (без телепортов)', () => {
  for (const variant of VARIANTS) {
    for (let n = 1; n <= 20; n++) {
      it(`этап ${n}: ${variant.name} — от старта до дома`, () => {
        const result = playStage(n, variant);
        expect(result.failedAt ?? 'ok').toBe('ok');
        expect(result.reachedExit).toBe(true);
      });
    }
  }
});
