import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { PlatformerScene } from './scenes/PlatformerScene';
import { GameOverScene } from './scenes/GameOverScene';
import { GAME_HEIGHT, GAME_WIDTH } from './dimensions';

/**
 * Фабрика конфигурации Phaser.Game. Сам Phaser.Game создаётся только в
 * клиентском useEffect (см. GameCanvas.tsx) — эта функция лишь описывает
 * конфиг и не создаёт никаких side-эффектов сама по себе.
 */
export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1d2333',
    physics: {
      default: 'arcade',
      arcade: {
        // y:0 — не заглушка "выключенной" гравитации, а признание, что этот
        // конфиг не может быть источником правды: реальное значение зависит
        // от scale.height/GRID_ROWS (blockHeight), которая известна только в
        // рантайме и меняется при резизе. Единственный источник правды —
        // PlatformerScene.resizeLevel() (blockHeight * WORLD_GRAVITY_COEFFICIENT,
        // dimensions.ts), которая гарантированно выполняется в create() ДО
        // первого update() — так что это поле физически не может успеть
        // повлиять на игру. Раньше здесь было 900 — недостижимое значение,
        // маскировавшееся под настоящее.
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    scene: [BootScene, PreloadScene, PlatformerScene, GameOverScene],
  };
}
