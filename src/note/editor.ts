/**
 * DOM layer of the block editor. One row per block: a marker (nothing, a dot,
 * or a checkbox) and a `contenteditable="plaintext-only"` text span. Keys map to
 * the pure operations in `shared/model.ts`; this file only moves the caret.
 */

import { $$, clamp } from '../shared/dom';
import { ICON } from '../shared/icons';
import { applyShortcut, backspaceAtStart, splitAt, toggleDone, type Block } from '../shared/model';

export interface Editor {
  setBlocks(blocks: Block[]): void;
  getBlocks(): Block[];
  focusStart(): void;
  focusEnd(): void;
}

const EMPTY: Block = { type: 'p', text: '', done: false };

function caretOffset(tx: HTMLElement): number {
  const sel = getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(tx);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return range.toString().length;
}

function setCaret(tx: HTMLElement, offset: number): void {
  tx.focus();
  const sel = getSelection();
  if (!sel) return;
  const range = document.createRange();
  const node = tx.firstChild;
  if (node) range.setStart(node, clamp(offset, 0, node.textContent?.length ?? 0));
  else range.setStart(tx, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function isSingleLine(tx: HTMLElement): boolean {
  const lineHeight = parseFloat(getComputedStyle(tx).lineHeight) || 22;
  return tx.scrollHeight < lineHeight * 1.6;
}

export function createEditor(
  root: HTMLElement,
  initial: Block[],
  onChange: (blocks: Block[]) => void,
): Editor {
  let blocks: Block[] = initial.length ? initial : [EMPTY];
  root.classList.add('editor');

  function rowEl(b: Block, i: number): HTMLElement {
    const row = document.createElement('div');
    row.className = `blk ${b.type}${b.done ? ' done' : ''}`;
    row.dataset.i = String(i);
    row.innerHTML =
      (b.type === 'check'
        ? `<button class="mk cb" tabindex="-1" aria-label="Toggle done">${ICON.check}</button>`
        : '<span class="mk"></span>') +
      '<div class="tx" contenteditable="plaintext-only" spellcheck="false"></div>';
    row.querySelector<HTMLElement>('.tx')!.textContent = b.text;
    return row;
  }

  function renderAll(): void {
    root.replaceChildren(...blocks.map(rowEl));
  }

  function focusBlock(i: number, pos: number | 'end'): void {
    const texts = $$('.tx', root);
    const tx = texts[clamp(i, 0, texts.length - 1)];
    if (!tx) return;
    setCaret(tx, pos === 'end' ? (tx.textContent?.length ?? 0) : pos);
  }

  function indexOf(tx: HTMLElement): number {
    return Number(tx.closest<HTMLElement>('.blk')?.dataset.i ?? 0);
  }

  function commit(): void {
    onChange(blocks);
  }

  root.addEventListener('keydown', (ev) => {
    const tx = (ev.target as HTMLElement).closest<HTMLElement>('.tx');
    if (!tx) return;
    const i = indexOf(tx);
    const text = tx.textContent ?? '';

    if (ev.key === 'Enter') {
      ev.preventDefault();
      blocks[i] = { ...blocks[i], text };
      const r = splitAt(blocks, i, caretOffset(tx));
      blocks = r.blocks;
      renderAll();
      focusBlock(r.focus, 0);
      commit();
      return;
    }
    if (ev.key === 'Backspace' && caretOffset(tx) === 0 && getSelection()?.isCollapsed) {
      if (blocks[i].type === 'p' && i === 0) return;
      ev.preventDefault();
      blocks[i] = { ...blocks[i], text };
      const r = backspaceAtStart(blocks, i);
      blocks = r.blocks;
      renderAll();
      focusBlock(r.focus, r.caret);
      commit();
      return;
    }
    if (ev.key === 'ArrowUp' && i > 0 && (isSingleLine(tx) || caretOffset(tx) === 0)) {
      ev.preventDefault();
      focusBlock(i - 1, Math.min(caretOffset(tx), blocks[i - 1].text.length));
      return;
    }
    if (
      ev.key === 'ArrowDown' &&
      i < blocks.length - 1 &&
      (isSingleLine(tx) || caretOffset(tx) === text.length)
    ) {
      ev.preventDefault();
      focusBlock(i + 1, Math.min(caretOffset(tx), blocks[i + 1].text.length));
      return;
    }
    if (ev.key === 'Escape') tx.blur();
  });

  root.addEventListener('input', (ev) => {
    const tx = (ev.target as HTMLElement).closest<HTMLElement>('.tx');
    if (!tx) return;
    const i = indexOf(tx);
    const text = tx.textContent ?? '';

    // A multi-line paste becomes one block per line.
    if (text.includes('\n')) {
      const lines = text.split('\n');
      blocks.splice(i, 1, ...lines.map((line) => ({ ...blocks[i], text: line })));
      renderAll();
      focusBlock(i + lines.length - 1, 'end');
      commit();
      return;
    }

    const updated = { ...blocks[i], text };
    const converted = applyShortcut(updated);
    if (converted) {
      blocks[i] = converted;
      renderAll();
      focusBlock(i, 0);
    } else {
      blocks[i] = updated;
    }
    commit();
  });

  root.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement;
    const cb = target.closest<HTMLElement>('.cb');
    if (cb) {
      const row = cb.closest<HTMLElement>('.blk')!;
      const i = Number(row.dataset.i);
      blocks = toggleDone(blocks, i);
      row.classList.toggle('done', blocks[i].done);
      commit();
      return;
    }
    if (!target.closest('.tx')) focusBlock(blocks.length - 1, 'end');
  });

  renderAll();

  return {
    setBlocks(next) {
      blocks = next.length ? next : [EMPTY];
      renderAll();
    },
    getBlocks: () => blocks,
    focusStart: () => focusBlock(0, 0),
    focusEnd: () => focusBlock(blocks.length - 1, 'end'),
  };
}
