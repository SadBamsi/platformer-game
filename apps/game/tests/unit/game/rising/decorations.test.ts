import { describe, expect, it } from 'vitest';
import { GRID_COLUMNS } from '@/game/dimensions';
import {
  decorationSeed,
  placeDecorations,
  TREE_HALF_WIDTH_BLOCKS,
  TREE_HEIGHT_ROWS,
} from '@/game/rising/decorations';
import { HOUSE_SIZE_BLOCKS } from '@/game/rising/goal';
import { generateStage, type PlatformSpec } from '@/game/rising/stageGenerator';

const STAGES = Array.from({ length: 20 }, (_, i) => i + 1);
const stages = new Map(STAGES.map((n) => [n, generateStage(n)]));

describe('placeDecorations — деревья на платформах', () => {
  it('детерминированы: один и тот же этап даёт те же деревья', () => {
    for (const n of [1, 7, 20]) {
      expect(placeDecorations(stages.get(n)!)).toEqual(placeDecorations(stages.get(n)!));
    }
  });

  it('seed декораций отличается от seed этапа (раскладка платформ не зависит от деревьев)', () => {
    for (const n of STAGES) expect(decorationSeed(n)).not.toBe(n);
  });

  it('не меняют этап: generateStage после расстановки даёт ту же раскладку', () => {
    const before = generateStage(3);
    placeDecorations(before);
    expect(generateStage(3)).toEqual(before);
  });

  it('на этапах 1–20 есть деревья обоих видов', () => {
    const all = STAGES.flatMap((n) => placeDecorations(stages.get(n)!));
    expect(all.some((d) => d.kind === 'spruce')).toBe(true);
    expect(all.some((d) => d.kind === 'leafy')).toBe(true);
    for (const n of STAGES) expect(placeDecorations(stages.get(n)!).length).toBeGreaterThan(0);
  });

  it('каждое дерево целиком стоит на земле или платформе пути, но не на выходе', () => {
    for (const n of STAGES) {
      const stage = stages.get(n)!;
      const ground: PlatformSpec = { x: 0, row: 0, width: GRID_COLUMNS };
      for (const tree of placeDecorations(stage)) {
        const support = [ground, ...stage.platforms].find(
          (p) =>
            p.row === tree.baseRow &&
            tree.centerX - TREE_HALF_WIDTH_BLOCKS >= p.x - 1e-9 &&
            tree.centerX + TREE_HALF_WIDTH_BLOCKS <= p.x + p.width + 1e-9,
        );
        expect(support, `этап ${n}, дерево на x=${tree.centerX}`).toBeDefined();
        expect(tree.baseRow).not.toBe(stage.exit.row);
      }
    }
  });

  it('дерево не заслоняет ни одну платформу и дом', () => {
    for (const n of STAGES) {
      const stage = stages.get(n)!;
      const exit = stage.exit;
      const houseCenter = exit.x + exit.width / 2;
      for (const tree of placeDecorations(stage)) {
        const left = tree.centerX - TREE_HALF_WIDTH_BLOCKS;
        const right = tree.centerX + TREE_HALF_WIDTH_BLOCKS;
        const top = tree.baseRow + TREE_HEIGHT_ROWS;
        for (const p of [...stage.platforms, exit]) {
          const hit = left < p.x + p.width && p.x < right && tree.baseRow < p.row && p.row - 1 < top;
          expect(hit, `этап ${n}: дерево x=${tree.centerX} ряд ${tree.baseRow} задевает платформу ряда ${p.row}`).toBe(false);
        }
        const hitsHouse =
          left < houseCenter + HOUSE_SIZE_BLOCKS / 2 &&
          houseCenter - HOUSE_SIZE_BLOCKS / 2 < right &&
          tree.baseRow < exit.row + HOUSE_SIZE_BLOCKS &&
          exit.row < top;
        expect(hitsHouse, `этап ${n}: дерево заслоняет дом`).toBe(false);
      }
    }
  });

  it('деревья на одной платформе не налезают друг на друга', () => {
    for (const n of STAGES) {
      const trees = placeDecorations(stages.get(n)!);
      for (const a of trees) {
        for (const b of trees) {
          if (a === b || a.baseRow !== b.baseRow) continue;
          expect(Math.abs(a.centerX - b.centerX)).toBeGreaterThanOrEqual(2 * TREE_HALF_WIDTH_BLOCKS);
        }
      }
    }
  });
});
