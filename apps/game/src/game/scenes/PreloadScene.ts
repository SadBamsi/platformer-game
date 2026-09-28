import Phaser from "phaser";
import { BACKGROUND_TILE_UNITS } from "../entities/ParallaxBackground";

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
    this.load.svg("grass-block-texture", "/assets/gemini-svg.svg", {
      width: 256,
      height: 256,
    });
  }

  create(): void {
    this.registerGirlFrames();
    this.generateRectTexture("platform-texture", 160, 24, 0x6b4f9d);

    this.scene.start("PlatformerScene");
  }

  private registerGirlFrames(): void {
    const texture = this.textures.get("girl-sprite");

    for (let frame = 0; frame < 8; frame += 1) {
      texture.add(String(frame), 0, frame * 32, 0, 32, 48);
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
