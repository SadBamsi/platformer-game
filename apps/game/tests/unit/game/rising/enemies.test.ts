import { describe, expect, it } from 'vitest';
import { GRID_COLUMNS, PLAYER_HITBOX_WIDTH_BLOCKS } from '@/game/dimensions';
import {
  ENEMY_HITBOX_PX,
  ENEMY_SPEED_BLOCKS_PER_SEC,
  enemyOrigin,
  enemyPose,
  FIRST_MOSS_STAGE,
  FIRST_ROOTS_STAGE,
  FIRST_STUMP_STAGE,
  mossPathLength,
  placeEnemies,
  type Enemy,
} from '@/game/rising/enemies';
import { generateStage, type Stage } from '@/game/rising/stageGenerator';

const STAGES = Array.from({ length: 20 }, (_, i) => i + 1);
const stages = new Map<number, Stage>(STAGES.map((n) => [n, generateStage(n)]));
const enemiesOf = (n: number): Enemy[] => placeEnemies(stages.get(n)!);
const kindsOn = (n: number): Set<string> => new Set(enemiesOf(n).map((e) => e.kind));

/** Номер платформы пути, на которой стоит враг (Пнявік — по ряду, Махнач — по ссылке). */
function platformIndex(stage: Stage, enemy: Enemy): number {
  if (enemy.kind === 'moss') return stage.platforms.indexOf(enemy.platform);
  if (enemy.kind === 'stump') return stage.platforms.findIndex((p) => p.row === enemy.row);
  return -1;
}

describe('placeEnemies — кто и где появляется', () => {
  it('на этапах 1–2 врагов нет', () => {
    expect(FIRST_STUMP_STAGE).toBe(3);
    expect(enemiesOf(1)).toEqual([]);
    expect(enemiesOf(2)).toEqual([]);
  });

  it('с 3-го этапа — только Пнявікі, на каждой третьей платформе', () => {
    for (let n = FIRST_STUMP_STAGE; n < FIRST_MOSS_STAGE; n++) {
      const stage = stages.get(n)!;
      const enemies = enemiesOf(n);
      expect(kindsOn(n)).toEqual(new Set(['stump']));
      const indices = enemies.map((e) => platformIndex(stage, e));
      const expected = stage.platforms.map((_, i) => i).filter((i) => i % 3 === 2);
      expect(indices).toEqual(expected);
    }
  });

  it('с 7-го этапа есть Махнач, с 10-го — Карчок', () => {
    for (let n = FIRST_MOSS_STAGE; n <= 20; n++) expect(kindsOn(n).has('moss'), `этап ${n}`).toBe(true);
    for (let n = 1; n < FIRST_MOSS_STAGE; n++) expect(kindsOn(n).has('moss')).toBe(false);
    for (let n = FIRST_ROOTS_STAGE; n <= 20; n++) expect(kindsOn(n).has('roots'), `этап ${n}`).toBe(true);
    for (let n = 1; n < FIRST_ROOTS_STAGE; n++) expect(kindsOn(n).has('roots')).toBe(false);
  });

  it('Махнач — только на платформах с номером i % 5 === 4', () => {
    for (let n = FIRST_MOSS_STAGE; n <= 20; n++) {
      const stage = stages.get(n)!;
      for (const e of enemiesOf(n).filter((x) => x.kind === 'moss')) {
        expect(platformIndex(stage, e) % 5).toBe(4);
      }
    }
  });

  it('на одной платформе не больше одного врага (и одного вида)', () => {
    for (const n of STAGES) {
      const stage = stages.get(n)!;
      const used = enemiesOf(n).filter((e) => e.kind !== 'roots').map((e) => platformIndex(stage, e));
      expect(new Set(used).size, `этап ${n}`).toBe(used.length);
      expect(used.every((i) => i >= 0)).toBe(true);
    }
  });

  it('на платформе выхода с домом врагов нет', () => {
    for (const n of STAGES) {
      const exitRow = stages.get(n)!.exit.row;
      for (const e of enemiesOf(n)) {
        if (e.kind === 'stump') expect(e.row).not.toBe(exitRow);
        if (e.kind === 'moss') expect(e.platform.row).not.toBe(exitRow);
      }
    }
  });

  it('Карчкі летают между каждой третьей парой платформ, соседние — в разные стороны', () => {
    for (let n = FIRST_ROOTS_STAGE; n <= 20; n++) {
      const stage = stages.get(n)!;
      const roots = enemiesOf(n).filter((e): e is Extract<Enemy, { kind: 'roots' }> => e.kind === 'roots');
      roots.forEach((r, k) => {
        const i = stage.platforms.findIndex((p, j) => j + 1 < stage.platforms.length && r.row === (p.row + stage.platforms[j + 1]!.row - 1) / 2);
        expect(i % 3, `этап ${n}`).toBe(1);
        if (k > 0) expect(r.dir).toBe(-roots[k - 1]!.dir);
      });
    }
  });

  it('детерминированы по номеру этапа', () => {
    for (const n of [3, 10, 20]) expect(placeEnemies(generateStage(n))).toEqual(enemiesOf(n));
  });
});

describe('enemyPose — траектории', () => {
  const samples = Array.from({ length: 400 }, (_, i) => i * 0.05);

  it('Пнявік ходит по своей платформе: центр над ней, край ствола выходит за край (чтобы сталкивать)', () => {
    for (const n of STAGES) {
      const stage = stages.get(n)!;
      for (const e of enemiesOf(n)) {
        if (e.kind !== 'stump') continue;
        const p = stage.platforms.find((q) => q.row === e.row)!;
        let minX = Infinity;
        let maxX = -Infinity;
        const hw = ENEMY_HITBOX_PX.stump.width / 2 / 32;
        const hh = ENEMY_HITBOX_PX.stump.height / 2 / 32;
        for (const t of samples) {
          const pose = enemyPose(e, t);
          expect(pose.x).toBeGreaterThan(p.x);
          expect(pose.x).toBeLessThan(p.x + p.width);
          minX = Math.min(minX, pose.x - hw);
          maxX = Math.max(maxX, pose.x + hw);
          expect(pose.row).toBeCloseTo(p.row + hh, 9); // ноги на платформе
        }
        // У края, не упирающегося в стену мира, ствол выходит за платформу.
        if (p.x > 0) expect(minX).toBeLessThan(p.x);
        if (p.x + p.width < GRID_COLUMNS) expect(maxX).toBeGreaterThan(p.x + p.width);
      }
    }
  });

  it('Пнявік разворачивается у края: смотрит туда, куда идёт', () => {
    const e = enemiesOf(3).find((x) => x.kind === 'stump')!;
    for (const t of samples) {
      const dx = enemyPose(e, t + 0.01).x - enemyPose(e, t).x;
      if (Math.abs(dx) > 1e-6) expect(enemyPose(e, t).facingRight).toBe(dx > 0);
    }
  });

  it('Махнач обходит платформу по кругу: путь непрерывный, ногами к платформе', () => {
    const e = enemiesOf(FIRST_MOSS_STAGE).find((x) => x.kind === 'moss')!;
    if (e.kind !== 'moss') throw new Error('нет Махнача');
    const p = e.platform;
    const period = mossPathLength(p) / ENEMY_SPEED_BLOCKS_PER_SEC.moss;
    const step = period / 500;
    let prev = enemyPose(e, 0);
    let sawTop = false;
    let sawBottom = false;
    let sawLeft = false;
    let sawRight = false;
    for (let i = 1; i <= 500; i++) {
      const pose = enemyPose(e, i * step);
      // Непрерывность: за шаг не больше пройденного пути (+ запас на округление).
      expect(Math.hypot(pose.x - prev.x, pose.row - prev.row)).toBeLessThan(ENEMY_SPEED_BLOCKS_PER_SEC.moss * step + 1e-6);
      if (pose.row > p.row && pose.x > p.x && pose.x < p.x + p.width) {
        sawTop = true;
        expect(pose.rotation).toBeCloseTo(0, 9);
      }
      if (pose.row < p.row - 1) sawBottom = true;
      if (pose.x < p.x) sawLeft = true;
      if (pose.x > p.x + p.width) sawRight = true;
      prev = pose;
    }
    expect([sawTop, sawRight, sawBottom, sawLeft]).toEqual([true, true, true, true]);
    // Через полный круг — в той же точке.
    const start = enemyPose(e, 0);
    const back = enemyPose(e, period);
    expect(back.x).toBeCloseTo(start.x, 6);
    expect(back.row).toBeCloseTo(start.row, 6);
  });

  it('Махнач не задевает соседние платформы и не выходит за стены мира', () => {
    for (let n = FIRST_MOSS_STAGE; n <= 20; n++) {
      const stage = stages.get(n)!;
      const others = [...stage.platforms, stage.exit];
      for (const e of enemiesOf(n)) {
        if (e.kind !== 'moss') continue;
        const r = ENEMY_HITBOX_PX.moss.width / 2 / 32;
        for (let t = 0; t < 60; t += 0.1) {
          const pose = enemyPose(e, t);
          expect(pose.x - r).toBeGreaterThan(PLAYER_HITBOX_WIDTH_BLOCKS);
          expect(pose.x + r).toBeLessThan(GRID_COLUMNS - PLAYER_HITBOX_WIDTH_BLOCKS);
          for (const o of others) {
            if (o === e.platform) continue;
            const hit =
              pose.x + r > o.x && pose.x - r < o.x + o.width && pose.row + r > o.row - 1 && pose.row - r < o.row;
            expect(hit, `этап ${n}: Махнач задевает платформу ряда ${o.row}`).toBe(false);
          }
        }
      }
    }
  });

  it('Карчок летает на всю ширину, не зажимая игрока у стены', () => {
    const e = enemiesOf(FIRST_ROOTS_STAGE).find((x) => x.kind === 'roots')!;
    const hw = ENEMY_HITBOX_PX.roots.width / 2 / 32;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let t = 0; t < 40; t += 0.05) {
      const { x } = enemyPose(e, t);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    expect(minX - hw).toBeGreaterThan(PLAYER_HITBOX_WIDTH_BLOCKS);
    expect(maxX + hw).toBeLessThan(GRID_COLUMNS - PLAYER_HITBOX_WIDTH_BLOCKS);
    expect(maxX - minX).toBeGreaterThan(GRID_COLUMNS - 3);
  });

  it('точка привязки картинки — центр хитбокса', () => {
    expect(enemyOrigin('stump')).toEqual({ x: 0.5, y: 19.5 / 32 });
    expect(enemyOrigin('moss')).toEqual({ x: 0.5, y: 19.5 / 32 });
    expect(enemyOrigin('roots')).toEqual({ x: 0.5, y: 12.5 / 32 });
  });
});
