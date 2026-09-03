/**
 * DOM layer of the block editor: one editable root holding one row per block.
 * A row is a non-editable marker (nothing, a dot, or a checkbox) plus a text
 * span with inline formatting as <b>, <i>, <u> and <s>.
 *
 * The browser owns typing, selection, copy, undo and inline formatting, so
 * Ctrl+A, drag-select, copy and multi-line delete work across the whole note.
 * Enter, Backspace/Delete at a block edge, paste, and the list shortcuts go
 * through the pure model in `shared/model.ts`. After every change the model
 * is re-read from the DOM, and any structure the browser mangled is rebuilt.
 */

import { clamp, esc } from '../shared/dom';
import { ICON } from '../shared/icons';
import {
  parseInline,
  run,
  runsLength,
  serializeInline,
  splitRuns,
  type Run,
} from '../shared/inline';
import {
  applyShortcut,
  backspaceAtStart,
  deleteAtEnd,
  parseLine,
  splitAt,
  toggleDone,
  type Block,
  type BlockType,
} from '../shared/model';

export type FormatCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough';

export interface Editor {
  setBlocks(blocks: Block[]): void;
  getBlocks(): Block[];
  focusStart(): void;
  focusEnd(): void;
  /** Toggles an inline style on the current selection. */
  format(command: FormatCommand): void;
}

interface Caret {
  block: number;
  offset: number;
}

const EMPTY: Block = { type: 'p', text: '', done: false };
const NO_STYLE = { b: false, i: false, u: false, s: false };

const plainLength = (b: Block) => runsLength(parseInline(b.text));

function runsToHTML(runs: Run[]): string {
  const html = runs
    .map((r) => {
      let h = esc(r.text);
      if (r.s) h = `<s>${h}</s>`;
      if (r.u) h = `<u>${h}</u>`;
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<b>${h}</b>`;
      return h;
    })
    .join('');
  return html || '<br>';
}

function rowEl(b: Block): HTMLElement {
  const row = document.createElement('div');
  row.className = `blk ${b.type}${b.done ? ' done' : ''}`;
  const marker =
    b.type === 'check'
      ? `<button class="mk cb" contenteditable="false" tabindex="-1" aria-label="Toggle done">${ICON.check}</button>`
      : '<span class="mk" contenteditable="false"></span>';
  row.innerHTML = `${marker}<span class="tx">${runsToHTML(parseInline(b.text))}</span>`;
  return row;
}

/** Reads styled runs out of a text span, noting anything the browser left in a shape we don't render. */
function collectRuns(
  node: Node,
  style: Omit<Run, 'text'>,
  out: Run[],
  flags: { dirty: boolean },
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text.includes('\n')) flags.dirty = true;
    if (text) out.push(run(text, style));
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  const tag = node.tagName;
  if (tag === 'BR') return;
  if (node.classList.contains('mk')) {
    flags.dirty = true;
    return;
  }
  if (
    tag === 'DIV' ||
    tag === 'P' ||
    node.classList.contains('blk') ||
    node.classList.contains('tx')
  ) {
    flags.dirty = true;
  }
  const next = { ...style };
  if (tag === 'B' || tag === 'STRONG') next.b = true;
  if (tag === 'I' || tag === 'EM') next.i = true;
  if (tag === 'U') next.u = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.s = true;
  const css = node.style;
  if (css.fontWeight === 'bold' || Number(css.fontWeight) >= 600) next.b = true;
  if (css.fontStyle === 'italic') next.i = true;
  if (css.textDecorationLine.includes('underline')) next.u = true;
  if (css.textDecorationLine.includes('line-through')) next.s = true;
  for (const child of Array.from(node.childNodes)) collectRuns(child, next, out, flags);
}

/** Splits runs on newline characters (only ever present after odd browser edits). */
function splitOnNewlines(runs: Run[]): Run[][] {
  const parts: Run[][] = [[]];
  for (const r of runs) {
    const lines = r.text.split('\n');
    lines.forEach((line, k) => {
      if (k > 0) parts.push([]);
      if (line) parts[parts.length - 1].push({ ...r, text: line });
    });
  }
  return parts;
}

export function createEditor(
  root: HTMLElement,
  initial: Block[],
  onChange: (blocks: Block[]) => void,
): Editor {
  let blocks: Block[] = initial.length ? initial : [{ ...EMPTY }];

  root.classList.add('editor');
  root.contentEditable = 'true';
  root.spellcheck = false;
  if (typeof document.execCommand === 'function') document.execCommand('styleWithCSS', false, 'false');

  function renderAll(): void {
    root.replaceChildren(...blocks.map(rowEl));
  }

  function renderBlock(i: number): void {
    root.children[i]?.replaceWith(rowEl(blocks[i]));
  }

  function commit(): void {
    onChange(blocks);
  }

  function blockIndexOf(node: Node | null): number {
    const el = node instanceof HTMLElement ? node : node?.parentElement;
    const row = el?.closest('.blk');
    return row && row.parentElement === root
      ? Array.prototype.indexOf.call(root.children, row)
      : -1;
  }

  /** Where the caret is, as a block index and a plain-text offset inside it. */
  function caret(): Caret | null {
    const sel = getSelection();
    if (!sel?.focusNode || !root.contains(sel.focusNode)) return null;
    const i = blockIndexOf(sel.focusNode);
    if (i < 0) return null;
    const tx = root.children[i].querySelector('.tx');
    if (!tx) return { block: i, offset: 0 };
    const range = document.createRange();
    range.setStart(tx, 0);
    range.setEnd(sel.focusNode, sel.focusOffset);
    return { block: i, offset: range.toString().length };
  }

  function setCaret(block: number, offset: number): void {
    const row = root.children[clamp(block, 0, root.children.length - 1)];
    const tx = row?.querySelector<HTMLElement>('.tx');
    if (!tx) return;
    root.focus({ preventScroll: true });
    const range = document.createRange();
    const walker = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let last: Text | null = null;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      last = node;
      if (remaining <= node.length) {
        range.setStart(node, remaining);
        remaining = -1;
        break;
      }
      remaining -= node.length;
    }
    if (remaining >= 0) {
      if (last) range.setStart(last, last.length);
      else range.setStart(tx, 0);
    }
    range.collapse(true);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    (row as HTMLElement).scrollIntoView?.({ block: 'nearest' });
  }

  /** Rebuilds the model from the DOM. `dirty` means the DOM needs re-rendering. */
  function fromDOM(): { blocks: Block[]; dirty: boolean } {
    const out: Block[] = [];
    let dirty = false;
    for (const child of Array.from(root.childNodes)) {
      const flags = { dirty: false };
      const runs: Run[] = [];
      let type: BlockType = 'p';
      let done = false;
      if (child instanceof HTMLElement && child.classList.contains('blk')) {
        type = child.classList.contains('bullet')
          ? 'bullet'
          : child.classList.contains('check')
            ? 'check'
            : 'p';
        done = child.classList.contains('done');
        const tx = child.querySelector(':scope > .tx');
        const mk = child.querySelector(':scope > .mk');
        if (tx) {
          for (const n of Array.from(tx.childNodes)) collectRuns(n, NO_STYLE, runs, flags);
          if (!mk || child.childNodes.length !== 2) flags.dirty = true;
          if (runsLength(runs) === 0 && !tx.querySelector('br')) flags.dirty = true;
        } else {
          for (const n of Array.from(child.childNodes)) collectRuns(n, NO_STYLE, runs, flags);
          flags.dirty = true;
        }
      } else {
        collectRuns(child, NO_STYLE, runs, flags);
        flags.dirty = true;
        if (runsLength(runs) === 0) continue;
      }
      const parts = splitOnNewlines(runs);
      if (parts.length > 1) flags.dirty = true;
      parts.forEach((part, k) => {
        out.push({ type, text: serializeInline(part), done: k === 0 && done });
      });
      dirty ||= flags.dirty;
    }
    if (out.length === 0) {
      out.push({ ...EMPTY });
      dirty = true;
    }
    return { blocks: out, dirty };
  }

  function syncFromDOM(): void {
    blocks = fromDOM().blocks;
  }

  function apply(next: Block[], focus: number, offset: number): void {
    blocks = next;
    renderAll();
    setCaret(focus, offset);
    commit();
  }

  // Enter splits the current block through the model; Shift+Enter does the same.
  root.addEventListener('beforeinput', (ev) => {
    if (ev.inputType !== 'insertParagraph' && ev.inputType !== 'insertLineBreak') return;
    ev.preventDefault();
    const sel = getSelection();
    if (sel && !sel.isCollapsed) document.execCommand('delete');
    syncFromDOM();
    const c = caret();
    if (!c) return;
    const r = splitAt(blocks, c.block, c.offset);
    apply(r.blocks, r.focus, 0);
  });

  root.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey && !ev.altKey) {
      const key = ev.key.toLowerCase();
      const cmd: FormatCommand | null =
        key === 'b'
          ? 'bold'
          : key === 'i'
            ? 'italic'
            : key === 'u'
              ? 'underline'
              : key === 's' && ev.shiftKey
                ? 'strikeThrough'
                : null;
      if (cmd) {
        ev.preventDefault();
        format(cmd);
        return;
      }
    }
    if (ev.key === 'Tab') {
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') {
      root.blur();
      return;
    }
    const sel = getSelection();
    if (!sel || !sel.isCollapsed) return;
    const c = caret();
    if (!c) return;
    if (ev.key === 'Backspace' && c.offset === 0) {
      ev.preventDefault();
      if (blocks[c.block].type === 'p' && c.block === 0) return;
      const r = backspaceAtStart(blocks, c.block);
      apply(r.blocks, r.focus, r.caret);
      return;
    }
    if (ev.key === 'Delete' && c.offset === plainLength(blocks[c.block])) {
      ev.preventDefault();
      if (c.block >= blocks.length - 1) return;
      const r = deleteAtEnd(blocks, c.block);
      apply(r.blocks, r.focus, r.caret);
    }
  });

  // Everything the browser did on its own: re-read, repair if needed, apply list shortcuts.
  root.addEventListener('input', () => {
    const c = caret();
    const derived = fromDOM();
    blocks = derived.blocks;
    if (derived.dirty) {
      renderAll();
      if (c) setCaret(c.block, c.offset);
    } else if (c && blocks[c.block]) {
      const converted = applyShortcut(blocks[c.block]);
      if (converted) {
        blocks[c.block] = converted;
        renderBlock(c.block);
        setCaret(c.block, 0);
      }
    }
    commit();
  });

  // Paste stays plain text. One line is inserted natively; several become one block per line.
  root.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const text = (ev.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n');
    if (!text) return;
    const lines = text.split('\n');
    if (lines.length === 1) {
      document.execCommand('insertText', false, text);
      return;
    }
    const sel = getSelection();
    if (sel && !sel.isCollapsed) document.execCommand('delete');
    syncFromDOM();
    const c = caret();
    if (!c) return;
    const cur = blocks[c.block];
    const [head, tail] = splitRuns(parseInline(cur.text), c.offset);
    const pasted = lines.map((line) => {
      const b = parseLine(line);
      return { ...b, text: serializeInline([run(b.text)]) };
    });
    const last = pasted[pasted.length - 1];
    const merged: Block[] = [
      { ...cur, text: serializeInline([...head, ...parseInline(pasted[0].text)]) },
      ...pasted.slice(1, -1),
      { ...last, text: serializeInline([...parseInline(last.text), ...tail]) },
    ];
    const next = blocks.slice();
    next.splice(c.block, 1, ...merged);
    apply(next, c.block + merged.length - 1, runsLength(parseInline(last.text)));
  });

  root.addEventListener('drop', (ev) => ev.preventDefault());

  // Checkbox clicks toggle without moving the caret.
  root.addEventListener('mousedown', (ev) => {
    if ((ev.target as HTMLElement).closest('.cb')) ev.preventDefault();
  });
  root.addEventListener('click', (ev) => {
    const cb = (ev.target as HTMLElement).closest('.cb');
    if (!cb) return;
    const i = blockIndexOf(cb);
    if (i < 0) return;
    blocks = toggleDone(blocks, i);
    root.children[i].classList.toggle('done', blocks[i].done);
    commit();
  });

  function format(command: FormatCommand): void {
    root.focus({ preventScroll: true });
    document.execCommand(command, false);
  }

  renderAll();

  return {
    setBlocks(next) {
      blocks = next.length ? next : [{ ...EMPTY }];
      renderAll();
    },
    getBlocks: () => blocks,
    focusStart: () => setCaret(0, 0),
    focusEnd: () => setCaret(blocks.length - 1, plainLength(blocks[blocks.length - 1])),
    format,
  };
}
