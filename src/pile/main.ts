/**
 * The pile: notes dealt out as a stack of small cards beside the tab.
 * Rust sizes and shows the window and sends `pile-open` with the data and layout;
 * this page deals the cards in, handles peek/click/delete, and folds on `pile-fold`.
 */

import '../shared/theme.css';
import './pile.css';

import { colorHex } from '../shared/colors';
import { $$, esc, fmtAgo, installPageDefaults } from '../shared/dom';
import { ICON } from '../shared/icons';
import { ipc, onPileFold, onPileOpen } from '../shared/ipc';
import { cardTop, ghostTop, stackedTop, tilt } from '../shared/layout';
import { parse, previewLines } from '../shared/model';
import type { Note, PileLayout, PileOpen } from '../shared/types';

const STAGGER_MS = 20;
const DEAL_MS = 360;
const FOLD_MS = 280;
const ARM_MS = 3000;

installPageDefaults();

const pile = document.createElement('div');
pile.className = 'pile stack';
document.body.appendChild(pile);

let generation = 0;
let dealt = false;
let dealTimer: ReturnType<typeof setTimeout> | undefined;
let foldTimer: ReturnType<typeof setTimeout> | undefined;
let armTimer: ReturnType<typeof setTimeout> | undefined;

function cardHTML(note: Note, i: number, layout: PileLayout): string {
  const lines = previewLines(parse(note.content), 3);
  return `<div class="fc${note.open ? ' is-open' : ''}" role="button" tabindex="0" data-id="${note.id}"
      style="--t:${cardTop(i, layout.step)}px;--z:${i + 1};--rot:${tilt(i).toFixed(2)}deg;background-color:${colorHex(note.color)}">
    <div class="fc-top"><span class="fc-l1${lines[0] ? '' : ' mute'}">${esc(lines[0] ?? 'Empty note')}</span><span class="openmark">open</span></div>
    <div class="fc-ln">${esc(lines[1] ?? '')}</div>
    <div class="fc-ln">${esc(lines[2] ?? '')}</div>
    <div class="fc-foot"><span class="ago">${fmtAgo(note.updatedAt)}</span></div>
    <button class="ic trash del" title="Delete" aria-label="Delete note">${ICON.trash}</button>
  </div>`;
}

function fromHTML(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function updateCard(el: HTMLElement, note: Note, i: number, layout: PileLayout): void {
  const lines = previewLines(parse(note.content), 3);
  el.style.setProperty('--t', `${cardTop(i, layout.step)}px`);
  el.style.setProperty('--z', String(i + 1));
  el.style.setProperty('--rot', `${tilt(i).toFixed(2)}deg`);
  el.style.backgroundColor = colorHex(note.color);
  el.classList.toggle('is-open', note.open);
  const l1 = el.querySelector('.fc-l1')!;
  l1.textContent = lines[0] ?? 'Empty note';
  l1.classList.toggle('mute', !lines[0]);
  const ln = el.querySelectorAll('.fc-ln');
  ln[0].textContent = lines[1] ?? '';
  ln[1].textContent = lines[2] ?? '';
  el.querySelector('.ago')!.textContent = fmtAgo(note.updatedAt);
}

/** Keyed render: existing cards are updated in place so position changes animate. */
function render({ data, layout }: PileOpen): void {
  pile.style.setProperty('--push', `${layout.push}px`);
  pile.style.setProperty('--t0', `${stackedTop(layout)}px`);
  let ghost = pile.querySelector<HTMLElement>('.ghost');
  if (!ghost) {
    ghost = fromHTML(
      `<button class="ghost" aria-label="New note">${ICON.plus}<span>New note</span></button>`,
    );
    pile.appendChild(ghost);
  }
  ghost.style.setProperty('--t', `${ghostTop(data.notes.length, layout.step)}px`);

  const keep = new Set<string>();
  data.notes.forEach((note, i) => {
    keep.add(note.id);
    const existing = pile.querySelector<HTMLElement>(`.fc[data-id="${note.id}"]`);
    if (existing) updateCard(existing, note, i, layout);
    else pile.insertBefore(fromHTML(cardHTML(note, i, layout)), ghost);
  });
  for (const el of $$('.fc', pile)) {
    if (!keep.has(el.dataset.id ?? '')) el.remove();
  }
}

function open(payload: PileOpen): void {
  generation++;
  clearTimeout(foldTimer);
  clearTimeout(dealTimer);
  disarm();
  if (dealt && !pile.classList.contains('stack')) {
    render(payload);
    return;
  }
  pile.replaceChildren();
  render(payload);
  pile.classList.add('stack');
  const cards = $$('.fc', pile);
  const ghost = pile.querySelector<HTMLElement>('.ghost');
  cards.forEach((c, i) => (c.style.transitionDelay = `${i * STAGGER_MS}ms`));
  if (ghost) ghost.style.transitionDelay = `${cards.length * STAGGER_MS}ms`;
  void pile.offsetWidth;
  pile.classList.remove('stack');
  dealt = true;
  dealTimer = setTimeout(() => {
    for (const el of $$('.fc, .ghost', pile)) el.style.transitionDelay = '';
  }, DEAL_MS + cards.length * STAGGER_MS);
}

function fold(): void {
  const gen = generation;
  clearTimeout(dealTimer);
  disarm();
  for (const el of $$('.fc, .ghost', pile)) el.style.transitionDelay = '';
  pile.classList.add('stack');
  foldTimer = setTimeout(() => {
    if (gen !== generation) return;
    dealt = false;
    pile.replaceChildren();
    void ipc.pileHidden();
  }, FOLD_MS);
}

function disarm(): void {
  clearTimeout(armTimer);
  for (const el of $$('.armed', pile)) el.classList.remove('armed');
}

function arm(button: HTMLElement, id: string): void {
  if (button.classList.contains('armed')) {
    disarm();
    void ipc.deleteNote(id);
    return;
  }
  disarm();
  button.classList.add('armed');
  armTimer = setTimeout(disarm, ARM_MS);
}

pile.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  if (target.closest('.ghost')) {
    void ipc.createNote();
    return;
  }
  const del = target.closest<HTMLElement>('.del');
  const card = target.closest<HTMLElement>('.fc');
  if (del && card?.dataset.id) {
    ev.stopPropagation();
    arm(del, card.dataset.id);
    return;
  }
  if (card?.dataset.id) void ipc.openNote(card.dataset.id);
});

pile.addEventListener('keydown', (ev) => {
  const card = (ev.target as HTMLElement).closest<HTMLElement>('.fc');
  if (card?.dataset.id && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    void ipc.openNote(card.dataset.id);
  }
});

document.documentElement.addEventListener('mouseenter', () => void ipc.hover('pile', true));
document.documentElement.addEventListener('mouseleave', () => void ipc.hover('pile', false));

void onPileOpen(open);
void onPileFold(fold);
