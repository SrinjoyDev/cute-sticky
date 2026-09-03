/**
 * A floating note window. The window label is `note-<id>`; the page loads the
 * note, renders the chrome and editor, and saves as you type.
 */

import '../shared/theme.css';
import './note.css';

import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { debounce, installPageDefaults, reportError } from '../shared/dom';
import { ipc, onNotesChanged } from '../shared/ipc';
import { parse, serialize, type Block } from '../shared/model';
import { shapeById, shapeDefsSVG } from '../shared/shapes';
import type { Color, Shape } from '../shared/types';
import { createBar } from './bar';
import { createEditor } from './editor';
import { applyColor, applyPin, applyShape, createNoteShell } from './shell';

const SAVE_MS = 150;
const CLOSE_MS = 160;
const ARM_MS = 3000;

installPageDefaults();

const win = getCurrentWindow();
const id = win.label.replace(/^note-/, '');

/** Grows the window when a shape's safe area would otherwise be too small to write in. */
async function ensureSize(shape: Shape): Promise<void> {
  const [minW, minH] = shapeById(shape).minWindow;
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;
  if (w >= minW && h >= minH) return;
  try {
    await win.setSize(new LogicalSize(Math.max(w, minW), Math.max(h, minH)));
  } catch (err) {
    reportError(`resize failed: ${String(err)}`);
  }
}

async function main(): Promise<void> {
  const note = await ipc.getNote(id);
  if (!note) {
    await ipc.closeNote(id);
    return;
  }

  document.body.insertAdjacentHTML('afterbegin', shapeDefsSVG());
  const el = createNoteShell({ color: note.color, shape: note.shape, pinned: note.pinned });
  document.body.appendChild(el);

  const inner = el.querySelector<HTMLElement>('.inner')!;
  const body = el.querySelector<HTMLElement>('.nb')!;
  const trash = el.querySelector<HTMLElement>('.trash')!;
  const swatches = el.querySelector<HTMLElement>('.sws')!;
  const shapes = el.querySelector<HTMLElement>('.shp')!;
  let pinned = note.pinned;
  let color: Color = note.color;
  let shape: Shape = note.shape;
  let closing = false;

  const save = debounce((blocks: Block[]) => {
    ipc
      .updateNote(id, { content: serialize(blocks) })
      .catch((err) => reportError(`save failed: ${String(err)}`));
  }, SAVE_MS);
  const editor = createEditor(body, parse(note.content), save);
  createBar(inner, body, editor);

  // Header: drag, colour, shape, pin, delete, close.
  el.querySelector<HTMLElement>('.grip')!.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) void win.startDragging();
  });
  el.querySelector<HTMLElement>('.sw')!.addEventListener('click', () => {
    shapes.classList.remove('open');
    swatches.classList.toggle('open');
  });
  el.querySelector<HTMLElement>('.shape')!.addEventListener('click', () => {
    swatches.classList.remove('open');
    shapes.classList.toggle('open');
  });
  swatches.addEventListener('click', (ev) => {
    const swo = (ev.target as HTMLElement).closest<HTMLElement>('.swo');
    if (!swo?.dataset.color) return;
    color = swo.dataset.color as Color;
    applyColor(el, color);
    void ipc.updateNote(id, { color });
    swatches.classList.remove('open');
  });
  shapes.addEventListener('click', (ev) => {
    const sho = (ev.target as HTMLElement).closest<HTMLElement>('.sho');
    if (!sho?.dataset.shape) return;
    shape = sho.dataset.shape as Shape;
    applyShape(el, shape);
    void ensureSize(shape);
    void ipc.updateNote(id, { shape });
    shapes.classList.remove('open');
  });
  el.querySelector<HTMLElement>('.pin')!.addEventListener('click', () => {
    pinned = !pinned;
    applyPin(el, pinned);
    void ipc.setNotePinned(id, pinned);
  });

  let armTimer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    clearTimeout(armTimer);
    trash.classList.remove('armed');
  };
  trash.addEventListener('click', () => {
    if (trash.classList.contains('armed')) {
      disarm();
      save.cancel();
      void ipc.deleteNote(id);
      return;
    }
    trash.classList.add('armed');
    armTimer = setTimeout(disarm, ARM_MS);
  });

  function close(): void {
    if (closing) return;
    closing = true;
    save.flush(editor.getBlocks());
    document.body.classList.add('closing');
    setTimeout(() => void ipc.closeNote(id), CLOSE_MS);
  }
  el.querySelector<HTMLElement>('.close')!.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && ev.key.toLowerCase() === 'w') {
      ev.preventDefault();
      close();
    }
  });

  el.querySelector<HTMLElement>('.rs')!.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    void win.startResizeDragging('SouthEast');
  });

  document.addEventListener('pointerdown', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t.closest('.sws, .sw')) swatches.classList.remove('open');
    if (!t.closest('.shp, .shape')) shapes.classList.remove('open');
    if (!t.closest('.trash')) disarm();
  });

  // Changes made elsewhere (another window, the pile) show up here.
  void onNotesChanged((data) => {
    const mine = data.notes.find((n) => n.id === id);
    if (!mine) return;
    if (mine.color !== color) {
      color = mine.color;
      applyColor(el, color);
    }
    if (mine.shape !== shape) {
      shape = mine.shape;
      applyShape(el, shape);
    }
    if (mine.pinned !== pinned) {
      pinned = mine.pinned;
      applyPin(el, pinned);
    }
  });

  editor.focusEnd();
}

main().catch((err) => reportError(`note failed to start: ${String(err)}`));
