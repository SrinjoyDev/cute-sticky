import { describe, expect, it } from 'vitest';
import { cardTop, ghostTop, stackedTop, tilt } from './layout';

describe('pile layout', () => {
  it('stacks cards by step', () => {
    expect(cardTop(0, 38)).toBe(0);
    expect(cardTop(3, 38)).toBe(114);
  });

  it('puts the ghost under the last card', () => {
    expect(ghostTop(4, 38)).toBe(3 * 38 + 110 + 6);
    expect(ghostTop(0, 38)).toBe(0);
  });

  it('tilts within a degree and varies between neighbours', () => {
    const t = [0, 1, 2, 3, 4].map(tilt);
    expect(Math.max(...t.map(Math.abs))).toBeLessThanOrEqual(1.1);
    expect(t[0]).not.toBe(t[1]);
  });

  it('stacked position centres a card on the visible pile', () => {
    expect(stackedTop({ step: 38, visibleH: 264, totalH: 342, push: 78, width: 192 })).toBe(
      264 / 2 - 55,
    );
  });
});
