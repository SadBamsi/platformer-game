import { describe, expect, it } from 'vitest';
import { HOUSE_SIZE_BLOCKS, housePlacement } from '@/game/rising/goal';
import { generateStage } from '@/game/rising/stageGenerator';
import { GLYPH_HEIGHT, GLYPH_WIDTH, LETTER_SPACING, layoutPixelText } from '@/game/ui/pixelFont';
import { STAGE_CLEAR_TITLE, stageClearSubtitle } from '@/game/ui/stageClear';

describe('housePlacement — дом на платформе выхода', () => {
  it('дом по центру платформы, стоит на её верхе', () => {
    const exit = { x: 10, row: 52, width: 5 };
    const house = housePlacement(exit);
    expect(house.centerX).toBe(12.5);
    expect(house.baseRow).toBe(52);
    // Низ сугроба на SVG y=29 из 32 — эта линия на платформе.
    expect(house.originY).toBeCloseTo(29 / 32);
  });

  it('зона касания — стены дома: уже платформы, целиком над ней', () => {
    for (let n = 1; n <= 20; n++) {
      const { exit } = generateStage(n);
      const { trigger } = housePlacement(exit);
      expect(trigger.x).toBeGreaterThanOrEqual(exit.x);
      expect(trigger.x + trigger.width).toBeLessThanOrEqual(exit.x + exit.width);
      expect(trigger.bottomRow).toBe(exit.row);
      // Стены — 12 из 32 единиц ширины картинки.
      expect(trigger.width).toBeCloseTo((12 / 32) * HOUSE_SIZE_BLOCKS);
    }
  });
});

describe('pixelFont — пиксельный шрифт 5×7', () => {
  it('ширина строки: 5 клеток на букву и 1 между буквами', () => {
    const layout = layoutPixelText('AB');
    expect(layout.width).toBe(2 * GLYPH_WIDTH + LETTER_SPACING);
    expect(layout.height).toBe(GLYPH_HEIGHT);
  });

  it('клетки второй буквы сдвинуты на ширину буквы с промежутком', () => {
    const one = layoutPixelText('I');
    const two = layoutPixelText(' I');
    const shifted = one.cells.map(([x, y]) => [x + GLYPH_WIDTH + LETTER_SPACING, y]);
    expect(two.cells).toEqual(shifted);
  });

  it('все символы надписи о победе есть в шрифте (этапы 1–999)', () => {
    expect(() => layoutPixelText(STAGE_CLEAR_TITLE)).not.toThrow();
    for (const n of [1, 9, 10, 99, 100, 999]) {
      expect(() => layoutPixelText(stageClearSubtitle(n))).not.toThrow();
    }
  });

  it('неизвестный символ — понятная ошибка, а не пустое место', () => {
    expect(() => layoutPixelText('Ł')).toThrow(/нет глифа/);
  });
});
