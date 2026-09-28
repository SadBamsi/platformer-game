/**
 * ActionMap.ts
 * ------------------------------------------------------------------------
 * Логический слой действий (GameAction) и профили физического маппинга
 * геймпада на эти действия.
 *
 * ВАЖНО: сырые индексы кнопок/осей W3C Standard Gamepad НЕ ДОЛЖНЫ покидать
 * этот файл. Всё, что снаружи (InputManager, GamepadSource) работает
 * только с GameAction и GamepadBindingTable — никогда с числовыми индексами
 * напрямую.
 */

/** Логические игровые действия — публичный контракт, согласован с фронтендом. */
export type GameAction =
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'JUMP'
  | 'DASH'
  | 'PAUSE'
  | 'CONFIRM'
  | 'CANCEL';

/** Полный список действий — источник истины для итерации по всем действиям. */
export const ALL_ACTIONS: readonly GameAction[] = [
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'JUMP',
  'DASH',
  'PAUSE',
  'CONFIRM',
  'CANCEL',
];

/** Запись «действие -> булево состояние», используется для сырых и производных снапшотов. */
export type ActionRecord = Record<GameAction, boolean>;

/** Создаёт новую запись состояния действий, все значения = initial. */
export function createActionRecord(initial = false): ActionRecord {
  return {
    MOVE_LEFT: initial,
    MOVE_RIGHT: initial,
    JUMP: initial,
    DASH: initial,
    PAUSE: initial,
    CONFIRM: initial,
    CANCEL: initial,
  };
}

/**
 * Биндинг одного действия на физические элементы геймпада (standard mapping).
 * - buttons: любая из кнопок в списке активирует действие (union).
 * - axisDigital: ось, трактуемая как цифровая кнопка (например стик как D-pad-замена
 *   на устройствах без надёжного D-pad, или сам левый стик для MOVE_LEFT/MOVE_RIGHT).
 *   Порог активации берётся из InputTuning.digitalAxisThreshold, а не отсюда,
 *   чтобы он подбирался в одном месте (см. tuning.ts).
 */
export interface GamepadActionBinding {
  readonly buttons?: readonly number[];
  readonly axisDigital?: { readonly index: number; readonly direction: 1 | -1 };
}

export type GamepadBindingTable = Readonly<Record<GameAction, GamepadActionBinding>>;

/**
 * Индексы кнопок/осей по спецификации W3C Standard Gamepad
 * (https://www.w3.org/TR/gamepad/#remapping). Это единственное место в слое
 * ввода, где эти числа существуют явно.
 *
 * НЕ ПРОВЕРЕНО через Context7 (не библиотека, а нативная спецификация браузера) —
 * индексы приведены по памяти из спецификации W3C Gamepad, которая много лет
 * стабильна и широко задокументирована. Реальное поведение конкретных пар
 * браузер+ОС+контроллер, подписывающих mapping==="standard", может отличаться
 * в деталях (особенно у нестандартных/малоизвестных устройств) — это требует
 * проверки на реальном железе, см. отчёт.
 */
const STANDARD_BUTTON = {
  BOTTOM_FACE: 0, // A (Xbox) / Cross (PS) / B (Nintendo, физически) — нижняя кнопка грани
  RIGHT_FACE: 1, // B (Xbox) / Circle (PS) / A (Nintendo, физически) — правая кнопка грани
  LEFT_FACE: 2, // X (Xbox) / Square (PS) / Y (Nintendo, физически) — левая кнопка грани
  TOP_FACE: 3, // Y (Xbox) / Triangle (PS) / X (Nintendo, физически) — верхняя кнопка грани
  LEFT_BUMPER: 4,
  RIGHT_BUMPER: 5,
  LEFT_TRIGGER: 6, // аналоговый (value 0..1), но у standard mapping также есть .pressed
  RIGHT_TRIGGER: 7,
  SELECT: 8, // Back / Share / Minus
  START: 9, // Start / Options / Plus
  LEFT_STICK_PRESS: 10,
  RIGHT_STICK_PRESS: 11,
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  HOME: 16, // Guide / PS-кнопка — намеренно нигде не забинжена (системная кнопка)
} as const;

export const STANDARD_AXIS = {
  LEFT_STICK_X: 0,
  LEFT_STICK_Y: 1,
  RIGHT_STICK_X: 2,
  RIGHT_STICK_Y: 3,
} as const;

/**
 * Биндинги по умолчанию — W3C standard mapping.
 * Позиционные индексы (0=нижняя грань, 1=правая грань и т.д.) одинаковы у Xbox
 * и PlayStation контроллеров под standard mapping — это буквально то, что
 * гарантирует спецификация, независимо от подписей на самих кнопках.
 */
export const STANDARD_BINDINGS: GamepadBindingTable = {
  MOVE_LEFT: {
    buttons: [STANDARD_BUTTON.DPAD_LEFT],
    axisDigital: { index: STANDARD_AXIS.LEFT_STICK_X, direction: -1 },
  },
  MOVE_RIGHT: {
    buttons: [STANDARD_BUTTON.DPAD_RIGHT],
    axisDigital: { index: STANDARD_AXIS.LEFT_STICK_X, direction: 1 },
  },
  JUMP: {
    buttons: [STANDARD_BUTTON.BOTTOM_FACE],
  },
  DASH: {
    // бампер как основной (чисто цифровой, без риска дребезга у порога) +
    // правый триггер как альтернатива — многие игроки интуитивно тянутся к триггеру
    buttons: [STANDARD_BUTTON.RIGHT_BUMPER, STANDARD_BUTTON.RIGHT_TRIGGER],
  },
  PAUSE: {
    buttons: [STANDARD_BUTTON.START],
  },
  CONFIRM: {
    buttons: [STANDARD_BUTTON.BOTTOM_FACE],
  },
  CANCEL: {
    buttons: [STANDARD_BUTTON.RIGHT_FACE],
  },
};

/**
 * Переопределение для Nintendo Switch Pro Controller (и, по аналогии, других
 * Nintendo-контроллеров под standard mapping).
 *
 * Причина: физическое позиционное расположение кнопок под W3C standard mapping
 * не меняется (индекс 0 всегда «нижняя кнопка грани»), НО пользовательская
 * конвенция Nintendo исторически обратная относительно Xbox/PS — на их платформах
 * подтверждение обычно физическая «B» (у нас это RIGHT_FACE), а отмена —
 * физическая «A» (BOTTOM_FACE). Это касается ТОЛЬКО CONFIRM/CANCEL в меню,
 * JUMP остаётся на BOTTOM_FACE, т.к. это игровое действие, а не UI-конвенция.
 *
 * НЕ ПРОВЕРЕНО на реальном железе в рамках этой сессии. Это осознанная
 * best-effort эвристика, а не подтверждённый факт — помечено явно в отчёте.
 */
const SWITCH_PRO_OVERRIDE: Partial<GamepadBindingTable> = {
  CONFIRM: { buttons: [STANDARD_BUTTON.RIGHT_FACE] },
  CANCEL: { buttons: [STANDARD_BUTTON.BOTTOM_FACE] },
};

/** Паттерн для распознавания Nintendo Switch Pro Controller по gamepad.id. */
const SWITCH_PRO_ID_PATTERN = /057e|nintendo|pro controller/i;

/**
 * Возвращает таблицу биндингов для конкретного геймпада.
 *
 * Безопасный откат: если mapping !== "standard" — раскладка неизвестна браузеру,
 * доверять индексам кнопок формально нельзя. Тем не менее возвращаем
 * STANDARD_BINDINGS как единственный разумный дефолт (по требованию задачи),
 * а не пытаемся угадывать дальше — это ЛУЧШЕЕ, что можно сделать без
 * пользовательского ремаппинга, и должно быть очевидно ненадёжным для
 * нестандартных устройств.
 */
export function resolveGamepadBindings(id: string, mapping: string): GamepadBindingTable {
  if (mapping !== 'standard') {
    return STANDARD_BINDINGS;
  }

  if (SWITCH_PRO_ID_PATTERN.test(id)) {
    return { ...STANDARD_BINDINGS, ...SWITCH_PRO_OVERRIDE };
  }

  return STANDARD_BINDINGS;
}
