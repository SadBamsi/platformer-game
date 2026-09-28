/**
 * Общий тестовый хелпер для мока Web Gamepad API в jsdom.
 *
 * jsdom не реализует Gamepad API вообще (navigator.getGamepads не
 * существует) — это САМО по себе используется одним из тестов ("поведение
 * без геймпада вообще"). Для тестов, которым нужен геймпад, мы подставляем
 * navigator.getGamepads вручную: GamepadSource.poll() и InputManager.update()
 * читают именно `navigator.getGamepads()` (глобальный navigator, который в
 * jsdom test environment — тот же объект, что window.navigator), поэтому
 * достаточно переопределить это свойство на window.navigator.
 *
 * Индексы кнопок/осей зеркалят STANDARD_BUTTON/STANDARD_AXIS из
 * apps/game/src/game/input/ActionMap.ts (сами константы не экспортированы
 * оттуда намеренно — "сырые индексы не должны покидать ActionMap.ts", см.
 * комментарий в файле), поэтому дублируем нужные нам индексы здесь явно,
 * как единственный сторонний (тестовый) код, которому обязательно нужно
 * говорить на языке W3C Standard Gamepad.
 */

export const BUTTON = {
  BOTTOM_FACE: 0, // JUMP / CONFIRM
  RIGHT_FACE: 1, // CANCEL
  LEFT_BUMPER: 4,
  RIGHT_BUMPER: 5, // DASH (основная)
  RIGHT_TRIGGER: 7, // DASH (альтернатива, аналоговая)
  START: 9, // PAUSE
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export const AXIS = {
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
} as const;

const BUTTON_COUNT = 17; // 0..16 (HOME включительно), см. ActionMap.ts

interface FakeGamepadOptions {
  id?: string;
  mapping?: string;
  /** Индексы кнопок, которые нужно считать нажатыми (pressed=true, value=1). */
  pressedButtons?: readonly number[];
  /** value отдельных аналоговых кнопок/триггеров, 0..1, независимо от pressedButtons. */
  buttonValues?: Readonly<Record<number, number>>;
  axes?: readonly number[];
}

export function makeFakeGamepad(options: FakeGamepadOptions = {}): Gamepad {
  const pressedButtons = new Set(options.pressedButtons ?? []);
  const buttonValues = options.buttonValues ?? {};

  const buttons: GamepadButton[] = Array.from({ length: BUTTON_COUNT }, (_, index) => {
    const pressed = pressedButtons.has(index);
    const value = buttonValues[index] ?? (pressed ? 1 : 0);
    return { pressed, touched: pressed, value } as GamepadButton;
  });

  const axes = [...(options.axes ?? [0, 0, 0, 0])];
  while (axes.length < 4) axes.push(0);

  return {
    id: options.id ?? 'Fake Gamepad (Standard Gamepad Vendor: 0000 Product: 0000)',
    index: 0,
    connected: true,
    mapping: options.mapping ?? 'standard',
    buttons,
    axes,
    timestamp: 0,
    vibrationActuator: null,
    hapticActuators: [],
    hand: '',
    hapticActuator: null,
  } as unknown as Gamepad;
}

/**
 * Подставляет navigator.getGamepads так, чтобы он возвращал `pads` при
 * каждом вызове (снапшот, как настоящий API — каждый вызов возвращает
 * значение из замыкания на момент вызова, что позволяет тестам менять
 * `pads` между кадрами через getPads()).
 */
export function stubGetGamepads(getPads: () => Array<Gamepad | null>): void {
  Object.defineProperty(window.navigator, 'getGamepads', {
    value: () => getPads(),
    configurable: true,
    writable: true,
  });
}

export function clearGetGamepads(): void {
  // @ts-expect-error -- удаляем тестовый стаб, возвращая jsdom к "нет Gamepad API"
  delete window.navigator.getGamepads;
}
