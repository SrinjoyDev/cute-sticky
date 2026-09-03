/** Card positions inside the pile. Step and heights come from Rust in `PileLayout`. */

import type { PileLayout } from './types';

export const CARD_H = 110;
export const GHOST_GAP = 6;

export const cardTop = (i: number, step: number): number => i * step;

export const ghostTop = (count: number, step: number): number =>
  count === 0 ? 0 : (count - 1) * step + CARD_H + GHOST_GAP;

/** A small, deterministic tilt per card so the pile reads as paper, not a list. */
export const tilt = (i: number): number => (((i * 37) % 5) - 2) * 0.55;

/** Where cards sit while stacked (before dealing, after folding): centred on the pile. */
export const stackedTop = (layout: PileLayout): number => layout.visibleH / 2 - CARD_H / 2;
