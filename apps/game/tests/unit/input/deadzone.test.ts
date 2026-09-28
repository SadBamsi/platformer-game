import { describe, expect, it } from 'vitest';
import { applyRadialDeadzone, applyResponseCurve, processStickAxis } from '@/game/input/deadzone';

describe('applyRadialDeadzone', () => {
  it('обнуляет вектор внутри мёртвой зоны (по модулю, не по осям)', () => {
    // magnitude = hypot(0.1, 0.1) ≈ 0.1414 < deadzone 0.15
    const result = applyRadialDeadzone(0.1, 0.1, 0.15);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('пропускает вектор ровно на границе мёртвой зоны как "внутри" (strict <)', () => {
    // magnitude === deadzone: условие в исходнике строгое "<", поэтому
    // magnitude === deadzone НЕ считается внутри зоны и должна пройти дальше.
    const result = applyRadialDeadzone(0.15, 0, 0.15);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('масштабирует оставшийся диапазон обратно в [0..1]: полный отклон стика даёт полный выход', () => {
    const result = applyRadialDeadzone(1, 0, 0.15);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('клэмпит магнитуду > 1 (погрешность калибровки стика)', () => {
    const result = applyRadialDeadzone(1.05, 0, 0.15);
    expect(result.x).toBeLessThanOrEqual(1);
    expect(result.x).toBeCloseTo(1, 10);
  });

  it('сохраняет направление вектора после мёртвой зоны', () => {
    const magnitude = Math.hypot(0.6, 0.8); // ровно 1.0, направление (0.6, 0.8)
    const result = applyRadialDeadzone(0.6, 0.8, 0.15);
    const resultMagnitude = Math.hypot(result.x, result.y);
    // направление сохранено: result нормализован в ту же сторону, что и вход
    expect(result.x / resultMagnitude).toBeCloseTo(0.6 / magnitude, 10);
    expect(result.y / resultMagnitude).toBeCloseTo(0.8 / magnitude, 10);
  });
});

describe('applyResponseCurve', () => {
  it('exponent=1 — линейно, без изменений', () => {
    expect(applyResponseCurve(0.5, 1)).toBeCloseTo(0.5, 10);
  });

  it('exponent=2 — квадратичная кривая уменьшает значения в (0,1)', () => {
    expect(applyResponseCurve(0.5, 2)).toBeCloseTo(0.25, 10);
  });

  it('сохраняет знак отрицательного значения', () => {
    expect(applyResponseCurve(-0.5, 2)).toBeCloseTo(-0.25, 10);
  });

  it('на границах 0 и 1 не меняет значение', () => {
    expect(applyResponseCurve(0, 2)).toBeCloseTo(0, 10);
    expect(applyResponseCurve(1, 2)).toBeCloseTo(1, 10);
  });
});

describe('processStickAxis — заявленное свойство: диагональ не быстрее кардинального направления', () => {
  const deadzone = 0.15;
  const exponent = 2.0; // DEFAULT_TUNING.stickResponseCurveExponent

  it('одинаковая магнитуда стика даёт одинаковую магнитуду выхода независимо от угла', () => {
    // Кардинальное направление: стик отклонён полностью по X, magnitude = 1.
    const cardinal = processStickAxis(1, 0, deadzone, exponent);
    // Диагональное направление с ТОЙ ЖЕ магнитудой физического отклонения (1.0),
    // как у реального круглого стика, отклонённого по диагонали до упора.
    const diagonal = processStickAxis(Math.SQRT1_2, Math.SQRT1_2, deadzone, exponent);

    const cardinalMagnitude = Math.hypot(cardinal.x, cardinal.y);
    const diagonalMagnitude = Math.hypot(diagonal.x, diagonal.y);

    // Ключевая проверка: диагональ НЕ быстрее кардинального направления.
    expect(diagonalMagnitude).toBeLessThanOrEqual(cardinalMagnitude + 1e-9);
    // И при данной реализации (обработка по модулю вектора) они равны, а не
    // просто "диагональ не быстрее" — это сильнее, чем минимально требуется,
    // но подтверждает, что deadzone действительно радиальная, а не поосевая.
    expect(diagonalMagnitude).toBeCloseTo(cardinalMagnitude, 10);
  });

  it('контрастная проверка: наивный поосевой (axial) клэмп сделал бы диагональ БЫСТРЕЕ — этой реализации это не свойственно', () => {
    // Демонстрация бага, которого тут нет: если бы функция клэмпила x и y
    // НЕЗАВИСИМО (как это делает частая наивная реализация), то для входа
        // (0.9, 0.9) магнитуда результата была бы sqrt(2)*0.9 ≈ 1.27 — больше
    // физически возможной единичной магнитуды стика. Радиальная реализация
    // никогда не превышает 1.
    const diagonalNearMax = processStickAxis(0.9, 0.9, deadzone, exponent);
    const diagonalMagnitude = Math.hypot(diagonalNearMax.x, diagonalNearMax.y);
    expect(diagonalMagnitude).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('полностью внутри мёртвой зоны по диагонали возвращает нулевой вектор', () => {
    // magnitude(0.1, 0.1) ≈ 0.1414 < 0.15
    const result = processStickAxis(0.1, 0.1, deadzone, exponent);
    expect(result).toEqual({ x: 0, y: 0 });
  });

  it('направление сохраняется даже после применения кривой отклика', () => {
    const result = processStickAxis(0, -1, deadzone, exponent); // стик вверх
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeLessThan(0);
  });
});
