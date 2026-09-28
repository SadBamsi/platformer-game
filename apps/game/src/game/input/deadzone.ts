/**
 * deadzone.ts
 * ------------------------------------------------------------------------
 * Радиальная (scaled-radial) мёртвая зона + степенная кривая отклика для
 * аналогового стика.
 *
 * Почему радиальная, а не поосевая (axial):
 * Поосевой клампинг (независимо режем |x| и |y|) даёт КВАДРАТНУЮ мёртвую
 * зону и портит диагонали — стик, отклонённый ровно по диагонали, проходит
 * порог раньше по каждой оси отдельно, чем стик, отклонённый по одной оси,
 * что физически бессмысленно и субъективно ощущается как «дёрганое»
 * управление. Радиальная зона считает порог по МОДУЛЮ вектора (x,y) —
 * геометрически честный круг, как физическое railway стика.
 *
 * Почему "scaled" (масштабированная), а не просто отсечение:
 * Если после прохождения порога deadzone возвращать сырое значение
 * (magnitude - deadzone) без масштабирования, теряется верхняя часть
 * диапазона — стик, отклонённый на 100%, даст выход меньше 1.0. Здесь
 * оставшийся диапазон [deadzone..1] растягивается обратно в [0..1], чтобы
 * полный отклон стика всегда давал полный игровой выход.
 */

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

const ZERO_VECTOR: Vector2 = { x: 0, y: 0 };

/**
 * Применяет радиальную scaled-deadzone к вектору стика (без кривой отклика).
 * Вынесена отдельно и экспортирована для тестируемости/переиспользования,
 * но основной путь в рантайме — processStickAxis ниже (там же считается и
 * кривая, на единой магнитуде, чтобы не искажать направление диагоналей).
 */
export function applyRadialDeadzone(x: number, y: number, deadzone: number): Vector2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadzone) {
    return ZERO_VECTOR;
  }
  // Защита от магнитуды чуть больше 1 из-за погрешности калибровки стика/округления.
  const clampedMagnitude = Math.min(magnitude, 1);
  const scaledMagnitude = (clampedMagnitude - deadzone) / (1 - deadzone);
  const nx = x / magnitude;
  const ny = y / magnitude;
  return { x: nx * scaledMagnitude, y: ny * scaledMagnitude };
}

/**
 * Степенная кривая отклика над уже скалярной величиной 0..1.
 * exponent > 1 — более точный контроль у центра (медленный старт),
 * exponent === 1 — линейно, exponent < 1 — резкий старт у центра.
 * Знак сохраняется на случай использования для одномерных величин (например
 * при вызове напрямую на moveX без учёта Y).
 */
export function applyResponseCurve(value: number, exponent: number): number {
  const sign = Math.sign(value);
  return sign * Math.pow(Math.abs(value), exponent);
}

/**
 * Основная функция обработки стика: deadzone + кривая отклика, применённые
 * к МОДУЛЮ вектора (не по каждой оси отдельно), с сохранением направления.
 * Это гарантирует, что диагональное движение не быстрее кардинального —
 * итоговая магнитуда результата никогда не превышает магнитуду результата
 * чистого кардинального отклонения при той же силе нажатия стика.
 */
export function processStickAxis(
  x: number,
  y: number,
  deadzone: number,
  exponent: number,
): Vector2 {
  const magnitude = Math.hypot(x, y);
  if (magnitude < deadzone) {
    return ZERO_VECTOR;
  }

  const clampedMagnitude = Math.min(magnitude, 1);
  const scaledMagnitude = (clampedMagnitude - deadzone) / (1 - deadzone);
  const curvedMagnitude = applyResponseCurve(scaledMagnitude, exponent);

  const nx = x / magnitude;
  const ny = y / magnitude;
  return { x: nx * curvedMagnitude, y: ny * curvedMagnitude };
}
