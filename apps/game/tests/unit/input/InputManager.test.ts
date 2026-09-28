import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from '@/game/input/InputManager';
import { BUTTON, clearGetGamepads, makeFakeGamepad, stubGetGamepads } from './testGamepad';

function dispatchKey(type: 'keydown' | 'keyup', code: string): void {
  window.dispatchEvent(new KeyboardEvent(type, { code }));
}

describe('InputManager', () => {
  let inputManager: InputManager;

  beforeEach(() => {
    inputManager = new InputManager();
  });

  afterEach(() => {
    inputManager.detach();
    clearGetGamepads();
  });

  describe('justPressed / justReleased — истинны ровно один кадр', () => {
    it('justPressed(CONFIRM) истинно только на кадре нажатия, затем false, пока клавиша держится', () => {
      inputManager.attach();

      inputManager.update(0);
      expect(inputManager.state.justPressed('CONFIRM')).toBe(false);

      dispatchKey('keydown', 'Enter');
      inputManager.update(10);
      expect(inputManager.state.justPressed('CONFIRM')).toBe(true);
      expect(inputManager.state.isDown('CONFIRM')).toBe(true);

      // Клавиша всё ещё зажата, новых событий не было — edge не повторяется.
      inputManager.update(20);
      expect(inputManager.state.justPressed('CONFIRM')).toBe(false);
      expect(inputManager.state.isDown('CONFIRM')).toBe(true);

      inputManager.update(30);
      expect(inputManager.state.justPressed('CONFIRM')).toBe(false);
    });

    it('justReleased(CONFIRM) истинно только на кадре отпускания', () => {
      inputManager.attach();

      dispatchKey('keydown', 'Enter');
      inputManager.update(0);
      expect(inputManager.state.justReleased('CONFIRM')).toBe(false);

      dispatchKey('keyup', 'Enter');
      inputManager.update(10);
      expect(inputManager.state.justReleased('CONFIRM')).toBe(true);
      expect(inputManager.state.isDown('CONFIRM')).toBe(false);

      inputManager.update(20);
      expect(inputManager.state.justReleased('CONFIRM')).toBe(false);
    });
  });

  describe('coyote time', () => {
    it('прыжок принимается, если нажат в течение coyoteTimeMs (100мс по умолчанию) после ухода с земли', () => {
      inputManager.attach();

      inputManager.setGrounded(true);
      inputManager.update(0); // кадр на земле — базовая точка отсчёта

      inputManager.setGrounded(false);
      inputManager.update(10); // ушёл с платформы на этом кадре -> coyoteUntilMs = 10 + 100 = 110

      dispatchKey('keydown', 'Space'); // нажал прыжок, всё ещё в воздухе, но внутри coyote-окна
      inputManager.setGrounded(false);
      inputManager.update(50); // 50 < 110 -> разрешение есть

      expect(inputManager.state.justPressed('JUMP')).toBe(true);
    });

    it('прыжок НЕ принимается, если нажат ПОСЛЕ истечения coyote-окна', () => {
      inputManager.attach();

      inputManager.setGrounded(true);
      inputManager.update(0);

      inputManager.setGrounded(false);
      inputManager.update(10); // coyoteUntilMs = 110

      dispatchKey('keydown', 'Space');
      inputManager.setGrounded(false);
      inputManager.update(150); // 150 > 110 -> окно закрыто

      // Не сработал немедленно (нет разрешения) — ушёл в jump buffer, а не отклонён молча.
      expect(inputManager.state.justPressed('JUMP')).toBe(false);
    });

    it('приземление закрывает coyote-окно сразу (grounded даёт разрешение напрямую, окно не нужно)', () => {
      inputManager.attach();

      inputManager.setGrounded(true);
      inputManager.update(0);
      inputManager.setGrounded(false);
      inputManager.update(10); // coyoteUntilMs = 110

      // Приземлился снова до истечения окна, без нажатия прыжка.
      inputManager.setGrounded(true);
      inputManager.update(50);

      // Ушёл с земли повторно.
      inputManager.setGrounded(false);
      inputManager.update(60); // новое coyoteUntilMs = 60 + 100 = 160

      dispatchKey('keydown', 'Space');
      inputManager.setGrounded(false);
      inputManager.update(120); // 120 < 160 (новое окно) -> должен сработать

      expect(inputManager.state.justPressed('JUMP')).toBe(true);
    });
  });

  describe('jump buffer', () => {
    it('прыжок, нажатый ДО приземления (без coyote-разрешения), срабатывает в момент касания земли', () => {
      inputManager.attach();

      inputManager.setGrounded(false);
      inputManager.update(0); // в воздухе с самого начала, разрешения нет

      dispatchKey('keydown', 'Space');
      inputManager.setGrounded(false);
      inputManager.update(10); // rawEdge есть, разрешения нет -> буферизуется до 10+120=130
      expect(inputManager.state.justPressed('JUMP')).toBe(false);

      inputManager.setGrounded(false);
      inputManager.update(50); // всё ещё в воздухе, буфер ещё жив, но grounded=false -> не срабатывает
      expect(inputManager.state.justPressed('JUMP')).toBe(false);

      inputManager.setGrounded(true);
      inputManager.update(100); // приземлился в пределах буфера (100 < 130) -> срабатывает
      expect(inputManager.state.justPressed('JUMP')).toBe(true);
    });

    it('буфер истекает: приземление ПОСЛЕ окна jumpBufferMs (120мс) прыжок не даёт', () => {
      inputManager.attach();

      inputManager.setGrounded(false);
      inputManager.update(0);

      dispatchKey('keydown', 'Space');
      inputManager.setGrounded(false);
      inputManager.update(10); // буферизуется до 130

      inputManager.setGrounded(false);
      inputManager.update(200); // 200 > 130 -> буфер истёк и очищен
      expect(inputManager.state.justPressed('JUMP')).toBe(false);

      inputManager.setGrounded(true);
      inputManager.update(210); // приземлился, но буфер уже пуст и новой rawEdge нет (кнопка всё ещё держится с t=10)
      expect(inputManager.state.justPressed('JUMP')).toBe(false);
    });
  });

  describe('поведение без геймпада вообще (клавиатурный фолбэк)', () => {
    it('jsdom не предоставляет navigator.getGamepads — gamepadConnected остаётся false, клавиатура работает', () => {
      expect(typeof window.navigator.getGamepads).not.toBe('function');

      inputManager.attach();
      inputManager.update(0);

      expect(inputManager.state.gamepadConnected).toBe(false);
      expect(inputManager.state.activeGamepadId).toBeNull();

      dispatchKey('keydown', 'ArrowRight');
      inputManager.update(10);
      expect(inputManager.state.moveX).toBe(1);

      dispatchKey('keyup', 'ArrowRight');
      dispatchKey('keydown', 'ArrowLeft');
      inputManager.update(20);
      expect(inputManager.state.moveX).toBe(-1);
    });
  });

  describe('detach() идемпотентность', () => {
    it('повторный вызов detach() без attach() не бросает исключение', () => {
      expect(() => inputManager.detach()).not.toThrow();
      expect(() => inputManager.detach()).not.toThrow();
    });

    it('detach() дважды подряд после attach() не бросает исключение', () => {
      inputManager.attach();
      expect(() => inputManager.detach()).not.toThrow();
      expect(() => inputManager.detach()).not.toThrow();
    });

    it('update()/setGrounded() после detach() безопасны (SSR-гвард/ранний выход), состояние не меняется', () => {
      inputManager.attach();
      dispatchKey('keydown', 'Space');
      inputManager.update(0);
      inputManager.detach();

      // После detach() состояние действий явно сброшено (см. комментарий в InputManager.detach()).
      expect(inputManager.state.isDown('JUMP')).toBe(false);
      expect(inputManager.state.moveX).toBe(0);

      // Дальнейшие вызовы не должны бросать, даже если attach() не звали снова.
      expect(() => inputManager.update(100)).not.toThrow();
      expect(() => inputManager.setGrounded(true)).not.toThrow();
    });
  });

  describe('геймпад: действие не "залипает" при отключении с зажатой кнопкой', () => {
    it('DASH перестаёт быть isDown в тот же кадр, когда геймпад пропадает из navigator.getGamepads()', () => {
      let connected = true;
      stubGetGamepads(() =>
        connected ? [makeFakeGamepad({ pressedButtons: [BUTTON.RIGHT_BUMPER] })] : [],
      );

      inputManager.attach();
      inputManager.setGrounded(false);
      inputManager.update(0);

      expect(inputManager.state.isDown('DASH')).toBe(true);
      expect(inputManager.state.justPressed('DASH')).toBe(true);
      expect(inputManager.state.gamepadConnected).toBe(true);

      // Геймпад пропал из массива (реальный сценарий отключения), кнопка
      // физически "осталась зажата" (это уже не может отразиться в API),
      // но GamepadSource.poll() обязан отдать пустой снапшот, а не последнее
      // известное состояние — см. комментарий в GamepadSource.ts.
      connected = false;
      inputManager.setGrounded(false);
      inputManager.update(10);

      expect(inputManager.state.isDown('DASH')).toBe(false);
      expect(inputManager.state.justReleased('DASH')).toBe(true); // естественный edge, а не "тихая" потеря состояния
      expect(inputManager.state.gamepadConnected).toBe(false);
      expect(inputManager.state.activeGamepadId).toBeNull();

      // И не "отскакивает" обратно нажатым на следующем кадре.
      inputManager.setGrounded(false);
      inputManager.update(20);
      expect(inputManager.state.isDown('DASH')).toBe(false);
      expect(inputManager.state.justReleased('DASH')).toBe(false);
    });

    it('onGamepadChange уведомляется при отключении геймпада с зажатой кнопкой', () => {
      let connected = true;
      stubGetGamepads(() =>
        connected ? [makeFakeGamepad({ pressedButtons: [BUTTON.RIGHT_BUMPER] })] : [],
      );

      const events: Array<{ connected: boolean; id: string | null }> = [];
      inputManager.onGamepadChange((isConnected, id) => events.push({ connected: isConnected, id }));

      inputManager.attach();
      inputManager.update(0); // connected: false -> true, событие

      connected = false;
      inputManager.update(10); // connected: true -> false, событие

      expect(events).toEqual([
        { connected: true, id: expect.any(String) },
        { connected: false, id: null },
      ]);
    });
  });

  describe('isDown/justReleased для JUMP остаются сырыми (не прощающими)', () => {
    it('justReleased(JUMP) реагирует на реальное отпускание кнопки, а не на буферизованную логику', () => {
      inputManager.attach();
      inputManager.setGrounded(true);

      dispatchKey('keydown', 'Space');
      inputManager.update(0);
      expect(inputManager.state.justPressed('JUMP')).toBe(true); // сработал сразу (grounded)

      dispatchKey('keyup', 'Space');
      inputManager.setGrounded(true);
      inputManager.update(10);
      expect(inputManager.state.justReleased('JUMP')).toBe(true); // сырой edge отпускания
      expect(inputManager.state.isDown('JUMP')).toBe(false);
    });
  });
});
