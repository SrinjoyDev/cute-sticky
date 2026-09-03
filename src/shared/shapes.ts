/**
 * Note shapes. Each shape is a clip for the paper plus a safe area (fractions of
 * the note's width and height) that the header, text and toolbar stay inside.
 * Clips are basic CSS shapes or SVG paths in the unit square, so they scale
 * with the window when a note is resized.
 */

import type { Shape } from './types';

export interface ShapeDef {
  id: Shape;
  name: string;
  /** Path in objectBoundingBox units (0–1), or null for a CSS basic shape. */
  path: string | null;
  /** Minimum window size (logical px, including the 16 px margins) that keeps the safe area usable. */
  minWindow: [number, number];
}

export const SHAPES: ShapeDef[] = [
  { id: 'square', name: 'Square', path: null, minWindow: [232, 182] },
  { id: 'circle', name: 'Circle', path: null, minWindow: [302, 302] },
  {
    id: 'cloud',
    name: 'Cloud',
    path: 'M0.26,0.94 C0.10,0.94 0.02,0.80 0.08,0.67 C0.00,0.56 0.06,0.41 0.19,0.39 C0.17,0.23 0.32,0.12 0.44,0.19 C0.50,0.04 0.71,0.04 0.77,0.19 C0.90,0.14 1.00,0.29 0.94,0.42 C1.03,0.51 1.00,0.68 0.90,0.73 C0.97,0.86 0.86,0.96 0.73,0.93 Z',
    minWindow: [392, 312],
  },
  {
    id: 'heart',
    name: 'Heart',
    path: 'M0.5,0.96 C0.5,0.96 0.02,0.64 0.02,0.33 C0.02,0.14 0.16,0.04 0.29,0.04 C0.39,0.04 0.47,0.10 0.5,0.19 C0.53,0.10 0.61,0.04 0.71,0.04 C0.84,0.04 0.98,0.14 0.98,0.33 C0.98,0.64 0.5,0.96 0.5,0.96 Z',
    minWindow: [332, 332],
  },
  {
    id: 'bubble',
    name: 'Speech bubble',
    path: 'M0.06,0 H0.94 Q1,0 1,0.06 V0.74 Q1,0.80 0.94,0.80 H0.32 L0.15,0.98 L0.18,0.80 H0.06 Q0,0.80 0,0.74 V0.06 Q0,0 0.06,0 Z',
    minWindow: [292, 272],
  },
];

export const shapeById = (id: string): ShapeDef => SHAPES.find((s) => s.id === id) ?? SHAPES[0];

/** Inline SVG holding the clip paths; append once per page. */
export function shapeDefsSVG(): string {
  const clips = SHAPES.filter((s) => s.path)
    .map(
      (s) =>
        `<clipPath id="clip-${s.id}" clipPathUnits="objectBoundingBox"><path d="${s.path}"/></clipPath>`,
    )
    .join('');
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${clips}</defs></svg>`;
}

/** Class names for every shape, to strip before applying a new one. */
export const SHAPE_CLASSES = SHAPES.map((s) => `shape-${s.id}`);
