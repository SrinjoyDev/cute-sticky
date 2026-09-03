/**
 * A floating note window. The window label is `note-<id>`; the page loads the
 * note, renders the header and editor, and saves as you type.
 */

import '../shared/theme.css';
import './note.css';

import { getCurrentWindow } from '@tauri-apps/api/window';

import { COLORS, colorHex } from '../shared/colors';
import { $$, debounce, installPageDefaults } from '../shared/dom';
import { ICON } from '../shared/icons';
import { ipc, onNotesChanged } from '../shared/ipc';
import { parse, serialize, type Block } from '../shared/model';
import type { Color, Note } from '../shared/types';
import { createEditor } from './editor';

const SAVE_MS = 150;
const CLOSE_MS = 160;
const ARM_MS = 3000;

installPageDefaults();

const win = getCurrentWindow();
const id = win.label.replace(/^note-/, '');

function headerHTML(note: Note): string {
  const swatches = COLORS.map(
    (c) =>
      `<button class="swo${c.id === note.color ? ' on' : ''}" data-color="${c.id}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`,
  ).join('');
  return `
    <div class="nh">
      <button class="sw" title="Colour" aria-label="Change colour"></button>
      <div class="grip"></div>
      <div class="acts">
        <button class="ic pin${note.pinned ? ' on' : ''}" title="${note.pinned ? 'Pinned on top' : 'Pin on top'}">${ICON.pin}</button>
        <button class="ic trash" title="Delete">${ICON.trash}</button>
        <button class="ic close" title="Close">${ICON.close}</button>
      </div>
    </div>
    <div class="nb"></div>
    <div class="rs" title="Resize"></div>
    <div class="sws">${swatches}</div>`;
}

async function main(): Promise<void> {
  const note = await ipc.getNote(id);
  if (!note) {
    await ipc.closeNote(id);
    return;
  }

  const el = document.createElement('div');
  el.className = 'note';
  el.style.setProperty('--paper', colorHex(note.color));
  el.innerHTML = headerHTML(note);
  document.body.appendChild(el);

  const body = el.querySelector<HTMLElement>('.nb')!;
  const pin = el.querySelector<HTMLElement>('.pin')!;
  const trash = el.querySelector<HTMLElement>('.trash')!;
  const swatches = el.querySelector<HTMLElement>('.sws')!;
  let pinned = note.pinned;
  let color: Color = note.color;
  let closing = false;

  const save = debounce((blocks: Block[]) => {
    void ipc.updateNote(id, { content: serialize(blocks) });
  }, SAVE_MS);
  const editor = createEditor(body, parse(note.content), save);

  // Header: drag, colour, pin, delete, close.
  el.querySelector<HTMLElement>('.grip')!.addEventListener('mousedown', (ev) => {
    if (ev.button === 0) void win.startDragging();
  });
  el.querySelector<HTMLElement>('.sw')!.addEventListener('click', () => {
    swatches.classList.toggle('open');
  });
  swatches.addEventListener('click', (ev) => {
    const swo = (ev.target as HTMLElement).closest<HTMLElement>('.swo');
    if (!swo?.dataset.color) return;
    setColor(swo.dataset.color as Color);
    void ipc.updateNote(id, { color });
    swatches.classList.remove('open');
  });
  pin.addEventListener('click', () => {
    pinned = !pinned;
    applyPin();
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
    if (!t.closest('.trash')) disarm();
  });

  function setColor(next: Color): void {
    color = next;
    el.style.setProperty('--paper', colorHex(next));
    for (const s of $$('.swo', swatches)) s.classList.toggle('on', s.dataset.color === next);
  }
  function applyPin(): void {
    pin.classList.toggle('on', pinned);
    pin.title = pinned ? 'Pinned on top' : 'Pin on top';
  }

  // Changes made elsewhere (colour from another window, pin state) show up here.
  void onNotesChanged((data) => {
    const mine = data.notes.find((n) => n.id === id);
    if (!mine) return;
    if (mine.color !== color) setColor(mine.color);
    if (mine.pinned !== pinned) {
      pinned = mine.pinned;
      applyPin();
    }
  });

  editor.focusEnd();
}

main().catch((err) => console.error('note failed to start', err));
