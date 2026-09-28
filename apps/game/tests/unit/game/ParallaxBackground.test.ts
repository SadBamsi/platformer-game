import '../../setup/canvas-stub';
import { describe, expect, it, vi } from 'vitest';

// См. Player.test.ts: подменяем 'phaser' на готовый дистрибутив.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<{ default?: unknown }>('phaser/dist/phaser.js');
  return { default: actual.default ?? actual };
});

import Phaser from 'phaser';
import {
  BACKGROUND_TILE_UNITS,
  BACKGROUND_UNITS_PER_BLOCK,
  PARALLAX_LAYERS,
  ParallaxBackground,
} from '@/game/entities/ParallaxBackground';
import { GRID_COLUMNS } from '@/game/dimensions';

class HostScene extends Phaser.Scene {
  constructor() {
    super('Host');
  }
}

/**
 * Настоящий Phaser в режиме HEADLESS (как arcadePlaythrough.test.ts):
 * текстуры фона подменены canvas-заглушками того же размера, что и плитки.
 */
function boot(): { game: Phaser.Game; scene: HostScene } {
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    width: 1024,
    height: 648,
    banner: false,
    audio: { noAudio: true },
    scene: [HostScene],
  });
  const addCanvas = (key: string, w: number, h: number): void => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    game.textures.addCanvas(key, canvas);
  };
  for (const key of ['__DEFAULT', '__MISSING', '__WHITE']) addCanvas(key, 4, 4);
  for (const layer of PARALLAX_LAYERS) addCanvas(layer.key, BACKGROUND_TILE_UNITS, BACKGROUND_TILE_UNITS);
  game.textures.emit(Phaser.Textures.Events.READY);
  game.loop.stop();
  game.headlessStep(1000, 1000 / 60);
  return { game, scene: game.scene.getScene('Host') as HostScene };
}

type Internals = {
  sky: Phaser.GameObjects.Graphics;
  layers: Array<{ sprite: Phaser.GameObjects.TileSprite; scrollFactor: number }>;
};

/** Клетка фона в экранных пикселях: блок / BACKGROUND_UNITS_PER_BLOCK. */
const unitFor = (viewWidth: number): number => viewWidth / GRID_COLUMNS / BACKGROUND_UNITS_PER_BLOCK;

describe('ParallaxBackground', () => {
  it('небо — градиент, закреплённый на экране (не едет с камерой)', () => {
    const { game, scene } = boot();
    const bg = new ParallaxBackground(scene);
    bg.layout(1024, 648, 0);
    const { sky } = bg as unknown as Internals;
    expect(sky.scrollFactorX).toBe(0);
    expect(sky.scrollFactorY).toBe(0);
    game.destroy(true);
  });

  it('слои-плитки размером с экран, клетка фона = 1/8 блока, квадратные пиксели', () => {
    const { game, scene } = boot();
    const bg = new ParallaxBackground(scene);
    bg.layout(1024, 648, 0);
    const { layers } = bg as unknown as Internals;
    expect(layers).toHaveLength(3);
    for (const { sprite } of layers) {
      expect(sprite.width).toBe(1024);
      expect(sprite.height).toBe(648);
      expect(sprite.tileScaleX).toBeCloseTo(unitFor(1024));
      expect(sprite.tileScaleY).toBeCloseTo(sprite.tileScaleX);
    }
    game.destroy(true);
  });

  it('сдвиг слоя на экране = scrollFactor × scrollY камеры (0.05, 0.2, 0.5)', () => {
    const { game, scene } = boot();
    const bg = new ParallaxBackground(scene);
    bg.layout(1024, 648, 0);
    const camera = scene.cameras.main;
    camera.scrollY = 1500;
    camera.emit(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, camera, null);
    const { layers } = bg as unknown as Internals;
    expect(layers.map((l) => l.scrollFactor)).toEqual([0.05, 0.2, 0.5]);
    for (const { sprite, scrollFactor } of layers) {
      // tilePosition — в пикселях текстуры, на экране умножается на tileScale.
      expect(sprite.tilePositionY * sprite.tileScaleY).toBeCloseTo(1500 * scrollFactor);
    }
    game.destroy(true);
  });

  it('после резиза масштаб и сдвиг пересчитаны под новый размер клетки', () => {
    const { game, scene } = boot();
    const bg = new ParallaxBackground(scene);
    bg.layout(1024, 648, 1500);
    bg.layout(400, 225, 1500);
    for (const { sprite, scrollFactor } of (bg as unknown as Internals).layers) {
      expect(sprite.width).toBe(400);
      expect(sprite.tileScaleX).toBeCloseTo(unitFor(400));
      expect(sprite.tilePositionY * sprite.tileScaleY).toBeCloseTo(1500 * scrollFactor);
    }
    game.destroy(true);
  });

  it('SHUTDOWN сцены снимает подписку на камеру (нет накопления при рестарте этапа)', () => {
    const { game, scene } = boot();
    const camera = scene.cameras.main;
    const before = camera.listenerCount(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE);
    new ParallaxBackground(scene);
    expect(camera.listenerCount(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE)).toBe(before + 1);
    scene.events.emit(Phaser.Scenes.Events.SHUTDOWN);
    expect(camera.listenerCount(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE)).toBe(before);
    game.destroy(true);
  });
});
