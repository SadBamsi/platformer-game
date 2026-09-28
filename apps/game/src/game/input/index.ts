/**
 * index.ts — публичный баррель слоя ввода.
 * ------------------------------------------------------------------------
 * Единственная точка входа, которую должен импортировать остальной код
 * игры (nextjs-frontend-engineer). Не импортируйте ActionMap.ts,
 * GamepadSource.ts и т.д. напрямую из-за пределов apps/game/src/game/input/ —
 * это внутренние детали реализации и могут меняться без предупреждения.
 */

export type { GameAction } from './ActionMap';
export { InputManager } from './InputManager';
export type { GamepadChangeListener, InputState } from './InputManager';
export { DEFAULT_TUNING } from './tuning';
export type { InputTuning } from './tuning';
