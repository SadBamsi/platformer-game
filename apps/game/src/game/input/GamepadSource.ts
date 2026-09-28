/**
 * GamepadSource.ts
 * ------------------------------------------------------------------------
 * Опрос Web Gamepad API. Ключевое правило: navigator.getGamepads() отдаёт
 * СНАПШОТ на момент вызова — мы читаем его заново на КАЖДОМ poll() и никогда
 * не сохраняем ссылку на объект Gamepad между кадрами (сохранённая ссылка
 * молча перестаёт обновляться — классическая ловушка этого API).
 *
 * gamepadconnected/gamepaddisconnected используются ТОЛЬКО для отслеживания
 * присутствия устройства (обновление activeIndex), а не для чтения
 * состояния кнопок/осей — это всегда делает poll() через getGamepads().
 *
 * Особенности, которые здесь обработаны:
 * - разреженный массив (null-слоты) — activeIndex перепроверяется каждый poll;
 * - нестабильность индексов после переподключения — при потере активного
 *   индекса ищем любой другой подключённый слот заново, а не держимся за 0;
 * - отключение геймпада посреди зажатой кнопки — poll() в этом случае
 *   возвращает "пустой" снапшот (всё false/0), а не последнее известное
 *   состояние, поэтому InputManager увидит естественный edge на justReleased
 *   и ничего не "залипнет";
 * - триггеры как аналоговая ось — GamepadButton.value используется наравне
 *   с .pressed (см. isActionPressed).
 */

import {
  ALL_ACTIONS,
  createActionRecord,
  resolveGamepadBindings,
  STANDARD_AXIS,
  type ActionRecord,
  type GamepadActionBinding,
} from './ActionMap';
import type { InputTuning } from './tuning';

export interface GamepadFrameSnapshot {
  readonly connected: boolean;
  /** id активного геймпада, как его сообщает браузер, или null. */
  readonly gamepadId: string | null;
  readonly actionDown: ActionRecord;
  /** Сырое значение левого стика по X, до deadzone и кривой отклика, -1..1. */
  readonly leftStickX: number;
  /** Сырое значение левого стика по Y, до deadzone и кривой отклика, -1..1. */
  readonly leftStickY: number;
}

function emptySnapshot(): GamepadFrameSnapshot {
  return {
    connected: false,
    gamepadId: null,
    actionDown: createActionRecord(false),
    leftStickX: 0,
    leftStickY: 0,
  };
}

/**
 * Проверяет, "нажато" ли действие согласно биндингу.
 *
 * Кнопки: .pressed — обычный цифровой признак. Дополнительно проверяем
 * .value > triggerActivationThreshold — это одновременно (а) правильный
 * способ обращаться с аналоговыми триггерами как с кнопкой и (б) защитный
 * фолбэк на случай, если какая-то связка браузер/ОС не выставляет .pressed
 * достоверно для триггеров (это НЕ подтверждённый факт для конкретных
 * устройств в рамках этой задачи, а защитное программирование).
 */
function isActionPressed(
  pad: Gamepad,
  binding: GamepadActionBinding,
  tuning: InputTuning,
): boolean {
  if (binding.buttons) {
    for (const buttonIndex of binding.buttons) {
      const button = pad.buttons[buttonIndex];
      if (!button) continue; // noUncheckedIndexedAccess: у устройства может не быть такой кнопки
      if (button.pressed || button.value > tuning.triggerActivationThreshold) {
        return true;
      }
    }
  }

  if (binding.axisDigital) {
    const axisValue = pad.axes[binding.axisDigital.index] ?? 0;
    const { direction } = binding.axisDigital;
    const overThreshold =
      direction > 0
        ? axisValue > tuning.digitalAxisThreshold
        : axisValue < -tuning.digitalAxisThreshold;
    if (overThreshold) {
      return true;
    }
  }

  return false;
}

export class GamepadSource {
  /**
   * Индекс активного геймпада в массиве navigator.getGamepads(). НЕ считается
   * стабильным идентификатором устройства — только текущей позицией в
   * разреженном массиве, перепроверяется на каждом poll().
   */
  private activeIndex: number | null = null;
  private listenersAttached = false;

  /**
   * event.gamepad здесь используется ТОЛЬКО чтобы прочитать .index — сам
   * объект нигде не сохраняется и не читается повторно (он тоже снапшот).
   */
  private readonly handleConnected = (event: GamepadEvent): void => {
    if (this.activeIndex === null) {
      this.activeIndex = event.gamepad.index;
    }
  };

  private readonly handleDisconnected = (event: GamepadEvent): void => {
    if (this.activeIndex === event.gamepad.index) {
      this.activeIndex = null;
    }
  };

  attach(): void {
    if (this.listenersAttached) return; // идемпотентность
    if (typeof window === 'undefined') return; // SSR-гвард
    window.addEventListener('gamepadconnected', this.handleConnected);
    window.addEventListener('gamepaddisconnected', this.handleDisconnected);
    this.listenersAttached = true;
  }

  detach(): void {
    if (!this.listenersAttached) return;
    window.removeEventListener('gamepadconnected', this.handleConnected);
    window.removeEventListener('gamepaddisconnected', this.handleDisconnected);
    this.listenersAttached = false;
    this.activeIndex = null;
  }

  /**
   * Должен вызываться ровно один раз за кадр. tuning передаётся каждый раз,
   * а не хранится внутри источника — единственный источник истины для
   * порогов остаётся в InputManager/tuning.ts.
   */
  poll(tuning: InputTuning): GamepadFrameSnapshot {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return emptySnapshot(); // SSR или браузер без поддержки Gamepad API
    }

    // Свежий снапшот каждый кадр — никогда не кэшируем этот массив или его элементы.
    const pads = navigator.getGamepads();

    if (this.activeIndex === null || !pads[this.activeIndex]) {
      this.activeIndex = null;
      for (let i = 0; i < pads.length; i += 1) {
        if (pads[i]) {
          this.activeIndex = i;
          break;
        }
      }
    }

    if (this.activeIndex === null) {
      return emptySnapshot();
    }

    const pad = pads[this.activeIndex];
    if (!pad || !pad.connected) {
      // Отключился между проверкой длины массива и чтением — не оставляем
      // предыдущее состояние, явно возвращаем "пусто", чтобы кнопки не залипли.
      this.activeIndex = null;
      return emptySnapshot();
    }

    const bindings = resolveGamepadBindings(pad.id, pad.mapping);
    const actionDown = createActionRecord(false);
    for (const action of ALL_ACTIONS) {
      actionDown[action] = isActionPressed(pad, bindings[action], tuning);
    }

    return {
      connected: true,
      gamepadId: pad.id,
      actionDown,
      leftStickX: pad.axes[STANDARD_AXIS.LEFT_STICK_X] ?? 0,
      leftStickY: pad.axes[STANDARD_AXIS.LEFT_STICK_Y] ?? 0,
    };
  }
}
