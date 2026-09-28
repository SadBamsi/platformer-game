import Phaser from 'phaser';
import type { InputManager } from '@/game/input';

interface GameOverData {
  score: number;
  levelId: string;
  stageReached: number;
  durationMs: number;
}

/**
 * Экран окончания игры. PlatformerScene останавливается через scene.start(),
 * поэтому именно эта сцена продолжает опрашивать InputManager.update() —
 * контракт требует ровно один update() за кадр на всю игру, а активна тут
 * только эта сцена.
 */
export class GameOverScene extends Phaser.Scene {
  // Названо НЕ `data` намеренно: у Phaser.Scene уже есть системное свойство
  // `data: Phaser.Data.DataManager` — присваивание своего объекта в `data`
  // перекрывает его и ломает внутренний DataManager сцены в рантайме.
  private gameOverData: GameOverData = { score: 0, levelId: '', stageReached: 1, durationMs: 0 };

  constructor() {
    super('GameOverScene');
  }

  create(data: GameOverData): void {
    this.gameOverData = data;
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    this.add
      .text(width / 2, height / 2 - 20, 'Игра окончена', { fontSize: '32px', color: '#ffffff' })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 24, `Счёт: ${this.gameOverData.score}`, {
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 52, `Достигнут этап: ${this.gameOverData.stageReached}`, {
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.add
      .text(width / 2, height / 2 + 84, 'Нажмите CONFIRM для рестарта', {
        fontSize: '16px',
        color: '#aab4d4',
      })
      .setOrigin(0.5);
  }

  override update(time: number): void {
    const inputManager = this.registry.get('inputManager') as InputManager | undefined;
    if (!inputManager) return;

    // Игрока на этом экране нет, поэтому grounded не может быть true — но
    // setGrounded() всё равно обязателен перед update() по контракту слоя ввода
    // (иначе прыжок будет молча недоступен ещё и после рестарта уровня).
    inputManager.setGrounded(false);
    inputManager.update(time);
    if (inputManager.state.justPressed('CONFIRM')) {
      // Рестарт БЕЗ данных — PlatformerScene.init() по умолчанию берёт
      // stage=1/lives=3/score=0 (новая игра с этапа 1), решение пользователя:
      // «0 жизней → GameOverScene», а не «рестарт того же этапа» (это уже
      // случилось раньше, пока жизни были).
      this.scene.start('PlatformerScene');
    }
  }
}
