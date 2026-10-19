import Phaser from "phaser";
import { BACKGROUND_TILE_UNITS } from "../entities/ParallaxBackground";
import { ENEMY_FRAME_COUNT, enemyTextureKey } from "../entities/Enemies";
import { ENEMY_FRAME_PX, ENEMY_KINDS } from "@/game/rising/enemies";

/**
 * Бинарных ассетов в проекте пока нет (см. public/assets/README.md) — вместо
 * них генерируем простые прямоугольные текстуры через Graphics.generateTexture.
 * Когда появятся спрайтшиты, здесь же добавится this.load.spritesheet(...).
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload(): void {
    this.load.audio("jump-sound", "/assets/advikgam-jump-up-245782.ogg");
    this.load.svg("girl-sprite", "/assets/sprite.svg", {
      width: 256,
      height: 48,
    });
    // Параллакс-фон (ParallaxBackground.ts): плитки-SVG из
    // scripts/generate-backgrounds.mjs. Растеризуем 1:1 (1 единица SVG =
    // 1 пиксель текстуры), крупно рисует фон с фильтром NEAREST.
    const tile = { width: BACKGROUND_TILE_UNITS, height: BACKGROUND_TILE_UNITS };
    this.load.svg("bg-stars", "/assets/bg_stars.svg", tile);
    this.load.svg("bg-clouds-far", "/assets/bg_clouds_far.svg", tile);
    this.load.svg("bg-clouds-near", "/assets/bg_clouds_near.svg", tile);
    // Дом-цель: SVG 32×32 в пиксельной сетке — растеризуем 1:1, а крупно
    // рисуем с фильтром NEAREST (PlatformerScene), чтобы пиксели были чёткими.
    this.load.svg("house-goal", "/assets/house_goal.svg", { width: 32, height: 32 });
    // Деревья-декорации (scripts/generate-trees.mjs): тот же холст 32×32, что у дома.
    this.load.svg("tree-spruce", "/assets/tree_spruce.svg", { width: 32, height: 32 });
    this.load.svg("tree-leafy", "/assets/tree_leafy.svg", { width: 32, height: 32 });
    // Враги-лесуны (scripts/generate-enemies.mjs): листы по ENEMY_FRAME_COUNT
    // кадров 32×32, растеризуем 1:1, кадры режем в registerEnemyFrames().
    for (const kind of ENEMY_KINDS) {
      this.load.svg(enemyTextureKey(kind), `/assets/enemy_${kind}.svg`, {
        width: ENEMY_FRAME_PX * ENEMY_FRAME_COUNT,
        height: ENEMY_FRAME_PX,
      });
    }
    this.load.svg("grass-block-texture", "/assets/gemini-svg.svg", {
      width: 256,
      height: 256,
    });
  }

  create(): void {
    this.registerGirlFrames();
    this.registerEnemyFrames();
    this.generateRectTexture("platform-texture", 160, 24, 0x6b4f9d);

    this.scene.start("PlatformerScene");
  }

  private registerGirlFrames(): void {
    const texture = this.textures.get("girl-sprite");

    for (let frame = 0; frame < 8; frame += 1) {
      texture.add(String(frame), 0, frame * 32, 0, 32, 48);
    }
  }

  private registerEnemyFrames(): void {
    for (const kind of ENEMY_KINDS) {
      const texture = this.textures.get(enemyTextureKey(kind));
      for (let frame = 0; frame < ENEMY_FRAME_COUNT; frame += 1) {
        texture.add(String(frame), 0, frame * ENEMY_FRAME_PX, 0, ENEMY_FRAME_PX, ENEMY_FRAME_PX);
      }
    }
  }

  private generateRectTexture(
    key: string,
    width: number,
    height: number,
    color: number,
  ): void {
    if (this.textures.exists(key)) return;
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, width, height);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
