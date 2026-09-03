/**
 * The note's chrome: paper, safe-area inner box, header, colour and shape
 * pickers, resize grip. Shared by the app page and the dev harness so both
 * look identical.
 */

import { COLORS, colorHex } from '../shared/colors';
import { $$ } from '../shared/dom';
import { ICON } from '../shared/icons';
import { SHAPES, SHAPE_CLASSES } from '../shared/shapes';
import type { Color, Shape } from '../shared/types';

export interface ShellState {
  color: Color;
  shape: Shape;
  pinned: boolean;
}

export function noteHTML(state: ShellState): string {
  const swatches = COLORS.map(
    (c) =>
      `<button class="swo${c.id === state.color ? ' on' : ''}" data-color="${c.id}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`,
  ).join('');
  const shapes = SHAPES.map(
    (s) =>
      `<button class="sho shape-${s.id}${s.id === state.shape ? ' on' : ''}" data-shape="${s.id}" title="${s.name}" aria-label="${s.name}"><span class="paper"></span></button>`,
  ).join('');
  return `
    <div class="paper"></div>
    <div class="inner">
      <div class="nh">
        <button class="sw" title="Colour" aria-label="Change colour"></button>
        <button class="ic shape" title="Shape" aria-label="Change shape">${ICON.shapes}</button>
        <div class="grip"></div>
        <div class="acts">
          <button class="ic pin${state.pinned ? ' on' : ''}" title="${state.pinned ? 'Pinned on top' : 'Pin on top'}">${ICON.pin}</button>
          <button class="ic trash" title="Delete">${ICON.trash}</button>
          <button class="ic close" title="Close">${ICON.close}</button>
        </div>
      </div>
      <div class="nb"></div>
    </div>
    <div class="rs" title="Resize"></div>
    <div class="sws">${swatches}</div>
    <div class="shp">${shapes}</div>`;
}

export function createNoteShell(state: ShellState): HTMLElement {
  const el = document.createElement('div');
  el.className = `note shape-${state.shape}`;
  el.style.setProperty('--paper', colorHex(state.color));
  el.innerHTML = noteHTML(state);
  return el;
}

export function applyColor(el: HTMLElement, color: Color): void {
  el.style.setProperty('--paper', colorHex(color));
  for (const s of $$('.swo', el)) s.classList.toggle('on', s.dataset.color === color);
}

export function applyShape(el: HTMLElement, shape: Shape): void {
  el.classList.remove(...SHAPE_CLASSES);
  el.classList.add(`shape-${shape}`);
  for (const s of $$('.sho', el)) s.classList.toggle('on', s.dataset.shape === shape);
}

export function applyPin(el: HTMLElement, pinned: boolean): void {
  const pin = el.querySelector<HTMLElement>('.pin');
  if (!pin) return;
  pin.classList.toggle('on', pinned);
  pin.title = pinned ? 'Pinned on top' : 'Pin on top';
}
