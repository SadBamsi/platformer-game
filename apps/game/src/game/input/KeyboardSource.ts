/**
 * KeyboardSource.ts
 * ------------------------------------------------------------------------
 * Фолбэк-источник ввода с клавиатуры. Всегда доступен, даже если геймпад
 * никогда не подключался — именно поэтому именно клавиатура, а не геймпад,
 * гарантирует playable-состояние игры "из коробки".
 *
 * Раскладка клавиш:
 *   MOVE_LEFT  — ArrowLeft, KeyA
 *   MOVE_RIGHT — ArrowRight, KeyD
 *   JUMP       — Space, KeyW, ArrowUp
 *   DASH       — ShiftLeft, ShiftRight
 *   PAUSE      — Escape
 *   CONFIRM    — Enter, NumpadEnter
 *   CANCEL     — Escape, Backspace
 *     (Escape сознательно обслуживает и PAUSE, и CANCEL — обычная практика:
 *      "выйти/отменить" в меню и "пауза" в игре это один и тот же логический
 *      жест "назад". Явно не было указано в задаче, помечаю как собственное
 *      расширение, а не часть исходной спецификации.)
 */

import { createActionRecord, type ActionRecord, type GameAction } from './ActionMap';

/** Клавиши (KeyboardEvent.code), для которых нужен preventDefault на игровом экране,
 * чтобы страница не скроллилась/не прокручивала фокус. */
const PREVENT_DEFAULT_CODES = new Set<string>([
  'Space',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
]);

/** Таблица код клавиши -> действие. Несколько клавиш могут маппиться на одно действие. */
const KEY_BINDINGS: Readonly<Record<string, GameAction>> = {
  ArrowLeft: 'MOVE_LEFT',
  KeyA: 'MOVE_LEFT',
  ArrowRight: 'MOVE_RIGHT',
  KeyD: 'MOVE_RIGHT',
  Space: 'JUMP',
  KeyW: 'JUMP',
  ArrowUp: 'JUMP',
  ShiftLeft: 'DASH',
  ShiftRight: 'DASH',
  Escape: 'PAUSE',
  Enter: 'CONFIRM',
  NumpadEnter: 'CONFIRM',
  Backspace: 'CANCEL',
};

/** Отдельно: клавиши, которые дублируют действие CANCEL (Escape уже занят PAUSE выше,
 * но должен активировать оба действия одновременно). */
const EXTRA_KEY_BINDINGS: Readonly<Record<string, GameAction>> = {
  Escape: 'CANCEL',
};

export interface KeyboardFrameSnapshot {
  readonly actionDown: ActionRecord;
}

export class KeyboardSource {
  private readonly downCodes = new Set<string>();
  private listenersAttached = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Не перехватываем ввод, если фокус в текстовом поле (например настройки/чат) —
    // иначе игра "съедала" бы обычный набор текста где-то ещё на странице.
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
    }

    this.downCodes.add(event.code);

    if (PREVENT_DEFAULT_CODES.has(event.code)) {
      event.preventDefault();
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.downCodes.delete(event.code);
  };

  /**
   * Потеря фокуса окна (alt-tab, переключение вкладки) не гарантирует keyup —
   * без этой очистки клавиша может "залипнуть" нажатой навсегда.
   */
  private readonly handleBlur = (): void => {
    this.downCodes.clear();
  };

  attach(): void {
    if (this.listenersAttached) return; // идемпотентность (React StrictMode)
    if (typeof window === 'undefined') return; // SSR-гвард
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.listenersAttached = true;
  }

  detach(): void {
    if (!this.listenersAttached) return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.listenersAttached = false;
    this.downCodes.clear();
  }

  poll(): KeyboardFrameSnapshot {
    const actionDown = createActionRecord(false);

    for (const code of this.downCodes) {
      const action = KEY_BINDINGS[code];
      if (action) {
        actionDown[action] = true;
      }
      const extraAction = EXTRA_KEY_BINDINGS[code];
      if (extraAction) {
        actionDown[extraAction] = true;
      }
    }

    return { actionDown };
  }
}
