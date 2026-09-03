/**
 * The editor's model: a note is a list of blocks, stored as one line each.
 *
 *   plain line
 *   - bullet
 *   - [ ] task
 *   - [x] done task
 *
 * Every function here is pure so it can be tested without a DOM.
 */

export type BlockType = 'p' | 'bullet' | 'check';

export interface Block {
  type: BlockType;
  text: string;
  done: boolean;
}

const CHECK_LINE = /^- \[( |x|X)\] /;

export function parseLine(line: string): Block {
  const m = CHECK_LINE.exec(line);
  if (m) return { type: 'check', text: line.slice(m[0].length), done: m[1].toLowerCase() === 'x' };
  if (line.startsWith('- ') || line.startsWith('* ')) {
    return { type: 'bullet', text: line.slice(2), done: false };
  }
  return { type: 'p', text: line, done: false };
}

export function parse(text: string): Block[] {
  return text.split('\n').map(parseLine);
}

export function serializeBlock(b: Block): string {
  if (b.type === 'bullet') return `- ${b.text}`;
  if (b.type === 'check') return `- [${b.done ? 'x' : ' '}] ${b.text}`;
  return b.text;
}

export function serialize(blocks: Block[]): string {
  return blocks.map(serializeBlock).join('\n');
}

function marker(b: Block): string {
  if (b.type === 'bullet') return '• ';
  if (b.type === 'check') return b.done ? '☑ ' : '☐ ';
  return '';
}

/** Up to `count` non-empty lines with their markers, for cards and tooltips. */
export function previewLines(blocks: Block[], count: number): string[] {
  return blocks
    .filter((b) => b.text.trim())
    .slice(0, count)
    .map((b) => marker(b) + b.text.trim());
}

export function firstLine(text: string): string {
  return previewLines(parse(text), 1)[0] ?? 'Empty note';
}

/** A markdown-style shortcut typed at the start of a block, or null when none applies. */
export function applyShortcut(b: Block): Block | null {
  if (b.type === 'p' && /^(- |\* )/.test(b.text)) {
    return { type: 'bullet', text: b.text.slice(2), done: false };
  }
  if (b.type !== 'check') {
    const m = /^\[( |x|X)?\] /.exec(b.text);
    if (m) {
      return {
        type: 'check',
        text: b.text.slice(m[0].length),
        done: (m[1] ?? '').toLowerCase() === 'x',
      };
    }
  }
  return null;
}

/** Enter: split block `i` at `offset`. An empty list item leaves the list instead. */
export function splitAt(
  blocks: Block[],
  i: number,
  offset: number,
): { blocks: Block[]; focus: number } {
  const cur = blocks[i];
  const out = blocks.slice();
  if (cur.type !== 'p' && cur.text.trim() === '') {
    out[i] = { type: 'p', text: '', done: false };
    return { blocks: out, focus: i };
  }
  out[i] = { ...cur, text: cur.text.slice(0, offset) };
  out.splice(i + 1, 0, { type: cur.type, text: cur.text.slice(offset), done: false });
  return { blocks: out, focus: i + 1 };
}

/** Backspace at the start of block `i`: unlist it, or merge it into the previous block. */
export function backspaceAtStart(
  blocks: Block[],
  i: number,
): { blocks: Block[]; focus: number; caret: number } {
  const cur = blocks[i];
  const out = blocks.slice();
  if (cur.type !== 'p') {
    out[i] = { type: 'p', text: cur.text, done: false };
    return { blocks: out, focus: i, caret: 0 };
  }
  if (i === 0) return { blocks: out, focus: 0, caret: 0 };
  const prev = blocks[i - 1];
  out[i - 1] = { ...prev, text: prev.text + cur.text };
  out.splice(i, 1);
  return { blocks: out, focus: i - 1, caret: prev.text.length };
}

export function toggleDone(blocks: Block[], i: number): Block[] {
  return blocks.map((b, j) => (j === i && b.type === 'check' ? { ...b, done: !b.done } : b));
}
