/**
 * The tab: a slim strip of coloured dots on the right edge, one per note.
 * Hover it to show the pile, click a dot to open that note, drag it to move.
 */

import '../shared/theme.css';
import './tab.css';

import { colorHex } from '../shared/colors';
import { installPageDefaults } from '../shared/dom';
import { ipc, onNotesChanged } from '../shared/ipc';
import { firstLine } from '../shared/model';
import type { Data } from '../shared/types';

const MAX_DOTS = 8;
const DRAG_THRESHOLD = 4;

installPageDefaults();

const tab = document.createElement('div');
tab.className = 'tab';
tab.title = 'Stickies';
document.body.appendChild(tab);

function render(data: Data): void {
  tab.replaceChildren();
  const notes = data.notes;
  if (notes.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'dot empty';
    tab.appendChild(empty);
  }
  for (const note of notes.slice(0, MAX_DOTS)) {
    const dot = document.createElement('button');
    dot.className = note.open ? 'dot on' : 'dot';
    dot.style.background = colorHex(note.color);
    dot.dataset.id = note.id;
    dot.title = firstLine(note.content);
    dot.setAttribute('aria-label', dot.title);
    dot.tabIndex = -1;
    tab.appendChild(dot);
  }
  if (notes.length > MAX_DOTS) {
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = `+${notes.length - MAX_DOTS}`;
    tab.appendChild(more);
  }
}

tab.addEventListener('mouseenter', () => void ipc.hover('tab', true));
tab.addEventListener('mouseleave', () => void ipc.hover('tab', false));

tab.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const dot = (ev.target as HTMLElement).closest<HTMLElement>('.dot');
  const startY = ev.screenY;
  const startTop = window.screenY;
  let moved = false;
  let pendingTop = startTop;
  let frame = 0;

  const flush = () => {
    frame = 0;
    void ipc.tabDrag(pendingTop, false);
  };
  const move = (m: PointerEvent) => {
    const dy = m.screenY - startY;
    if (!moved && Math.abs(dy) > DRAG_THRESHOLD) {
      moved = true;
      tab.classList.add('dragging');
      void ipc.hover('tab', false);
    }
    if (!moved) return;
    pendingTop = startTop + dy;
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const up = (m: PointerEvent) => {
    tab.releasePointerCapture(ev.pointerId);
    tab.removeEventListener('pointermove', move);
    tab.removeEventListener('pointerup', up);
    tab.removeEventListener('pointercancel', up);
    tab.classList.remove('dragging');
    if (moved) {
      cancelAnimationFrame(frame);
      void ipc.tabDrag(startTop + (m.screenY - startY), true);
    } else if (dot?.dataset.id) {
      void ipc.openNote(dot.dataset.id);
    }
  };

  tab.setPointerCapture(ev.pointerId);
  tab.addEventListener('pointermove', move);
  tab.addEventListener('pointerup', up);
  tab.addEventListener('pointercancel', up);
});

void onNotesChanged(render);
ipc.listNotes().then(render, (err) => console.error('list_notes failed', err));
