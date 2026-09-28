import Phaser from 'phaser';
import { GRID_COLUMNS } from '../dimensions';

/**
 * Слои-плитки фона: ключ текстуры (PreloadScene) и доля скорости камеры.
 * 0 — слой стоит на месте, 1 — едет вместе с уровнем. Плитки сгенерированы
 * scripts/generate-backgrounds.mjs: 256×256 единиц, бесшовные по обеим осям.
 */
export const PARALLAX_LAYERS = [
  { key: 'bg-stars', scrollFactor: 0.05 },
  { key: 'bg-clouds-far', scrollFactor: 0.2 },
  { key: 'bg-clouds-near', scrollFactor: 0.5 },
] as const;

/** Сторона плитки в единицах (= пикселях текстуры): SVG растеризуется 1:1. */
export const BACKGROUND_TILE_UNITS = 256;

/**
 * Сколько пикселей рисунка фона приходится на ширину одного блока уровня.
 * 8 → клетка фона = 1/8 блока (~4 экранных пикселя при окне 1024): фон
 * чуть мельче дома и платформ, но того же порядка, пиксель-арт выглядит
 * одним стилем.
 */
export const BACKGROUND_UNITS_PER_BLOCK = 8;

/** Ступени ночного градиента сверху вниз. */
export const SKY_BANDS = [
  0x0b0e1f, 0x0d1124, 0x10142a, 0x121730, 0x141a36, 0x171d3c, 0x1a2144, 0x1c2450,
] as const;

const BASE_DEPTH = -40;

/**
 * Параллакс-фон вертикального этапа.
 *
 * Небо — ступенчатый градиент, нарисованный кодом (Graphics) на весь экран:
 * картинка неба любой пропорции на горизонтальном экране обрезалась бы или
 * растягивалась. Границы полос кратны клетке фона — ступени ровные.
 *
 * Звёзды и облака — TileSprite размером с экран, закреплённые на экране;
 * внутри них сдвигается текстура (tilePositionY). Плитки повторяются по
 * обеим осям, масштаб — клетка фона = блок / BACKGROUND_UNITS_PER_BLOCK,
 * поэтому размер «пикселя» фона привязан к блоку, а не к ширине картинки.
 *
 * Почему не TileSprite на всю высоту этапа со scrollFactor: у TileSprite
 * внутренний canvas размером с сам объект (TileSprite.js updateCanvas), на
 * этапе в 120 рядов это ~15 МБ на слой.
 *
 * Сдвиг ставится по событию камеры FOLLOW_UPDATE: камера шлёт его в
 * preRender, после расчёта scrollY и до отрисовки, поэтому фон не отстаёт
 * от уровня на кадр (как было бы при обновлении из scene.update()).
 */
export class ParallaxBackground {
  private readonly sky: Phaser.GameObjects.Graphics;
  private readonly layers: Array<{ sprite: Phaser.GameObjects.TileSprite; scrollFactor: number }>;
  private unitPx = 1;

  constructor(scene: Phaser.Scene) {
    this.sky = scene.add.graphics().setScrollFactor(0).setDepth(BASE_DEPTH);

    this.layers = PARALLAX_LAYERS.map((layer, index) => {
      scene.textures.get(layer.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      return {
        sprite: scene.add
          .tileSprite(0, 0, 1, 1, layer.key)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(BASE_DEPTH + index + 1),
        scrollFactor: layer.scrollFactor,
      };
    });

    const camera = scene.cameras.main;
    const onFollowUpdate = (cam: Phaser.Cameras.Scene2D.Camera): void => this.scrollTo(cam.scrollY);
    camera.on(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, onFollowUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      camera.off(Phaser.Cameras.Scene2D.Events.FOLLOW_UPDATE, onFollowUpdate);
    });
  }

  /** Вызывать при создании этапа и при каждом резизе. Размеры — в пикселях. */
  layout(viewWidth: number, viewHeight: number, scrollY: number): void {
    this.unitPx = viewWidth / GRID_COLUMNS / BACKGROUND_UNITS_PER_BLOCK;

    this.sky.clear();
    const bandHeight = Math.ceil(viewHeight / SKY_BANDS.length / this.unitPx) * this.unitPx;
    SKY_BANDS.forEach((color, index) => {
      const top = index * bandHeight;
      const isLast = index === SKY_BANDS.length - 1;
      this.sky.fillStyle(color, 1);
      this.sky.fillRect(0, top, viewWidth, isLast ? Math.max(0, viewHeight - top) : bandHeight);
    });

    for (const { sprite } of this.layers) {
      sprite.setSize(viewWidth, viewHeight);
      sprite.setTileScale(this.unitPx, this.unitPx);
    }
    this.scrollTo(scrollY);
  }

  /**
   * tilePosition задаётся в пикселях текстуры, а на экране сдвиг равен
   * tilePosition · tileScale — отсюда деление на размер клетки.
   */
  private scrollTo(scrollY: number): void {
    for (const { sprite, scrollFactor } of this.layers) {
      sprite.tilePositionY = (scrollY * scrollFactor) / this.unitPx;
    }
  }
}
