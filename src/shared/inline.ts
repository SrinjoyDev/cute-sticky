/**
 * Inline formatting inside one block, stored as readable markup:
 *
 *   **bold**   *italic*   __underline__   ~~strike~~
 *
 * A block's text is parsed into runs (stretches of text that share one style),
 * which is what the editor renders and edits. Literal marker characters are
 * escaped with a backslash on the way out, and unbalanced markers are read as
 * plain text so older notes never change meaning.
 */

export interface Run {
  text: string;
  b: boolean;
  i: boolean;
  u: boolean;
  s: boolean;
}

export type StyleKey = 'b' | 'i' | 'u' | 's';

export const STYLE_KEYS: readonly StyleKey[] = ['b', 'i', 'u', 's'];

const MARK: Record<StyleKey, string> = { b: '**', i: '*', u: '__', s: '~~' };

export function run(text: string, style: Partial<Omit<Run, 'text'>> = {}): Run {
  return { text, b: !!style.b, i: !!style.i, u: !!style.u, s: !!style.s };
}

export function sameStyle(a: Run, b: Run): boolean {
  return a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s;
}

/** Drops empty runs and merges neighbours that share a style. */
export function normalizeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** Which marker starts at `pos`, longest first, or null. Escaped characters never match. */
function markerAt(text: string, pos: number): StyleKey | null {
  if (text.startsWith('**', pos)) return 'b';
  if (text.startsWith('__', pos)) return 'u';
  if (text.startsWith('~~', pos)) return 's';
  if (text[pos] === '*') return 'i';
  return null;
}

/** Index of the next unescaped occurrence of `mark` after `from`, or -1. */
function findClose(text: string, mark: string, from: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text.startsWith(mark, i)) return i;
    i += 1;
  }
  return -1;
}

export function parseInline(text: string): Run[] {
  const style = { b: false, i: false, u: false, s: false };
  const runs: Run[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) runs.push(run(buf, style));
    buf = '';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && /[*_~\\]/.test(text[i + 1] ?? '')) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    const key = markerAt(text, i);
    if (key) {
      const mark = MARK[key];
      if (style[key]) {
        flush();
        style[key] = false;
        i += mark.length;
        continue;
      }
      if (findClose(text, mark, i + mark.length) !== -1) {
        flush();
        style[key] = true;
        i += mark.length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return normalizeRuns(runs);
}

function escapeText(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '\\' && (next === '*' || next === '_' || next === '~' || next === '\\'))
      out += '\\\\';
    else if (ch === '*') out += '\\*';
    else if (ch === '~' && next === '~') out += '\\~';
    else if (ch === '_' && (next === '_' || text[i - 1] === '_')) out += '\\_';
    else out += ch;
  }
  return out;
}

/** Canonical markup: every style change closes what is open and reopens what is needed. */
export function serializeInline(runs: Run[]): string {
  let out = '';
  let open: StyleKey[] = [];
  for (const r of normalizeRuns(runs)) {
    const wanted = STYLE_KEYS.filter((k) => r[k]);
    const changed = wanted.length !== open.length || wanted.some((k) => !open.includes(k));
    if (changed) {
      for (const k of [...open].reverse()) out += MARK[k];
      for (const k of wanted) out += MARK[k];
      open = wanted;
    }
    out += escapeText(r.text);
  }
  for (const k of [...open].reverse()) out += MARK[k];
  return out;
}

export function plainText(text: string): string {
  return parseInline(text)
    .map((r) => r.text)
    .join('');
}

export function runsLength(runs: Run[]): number {
  return runs.reduce((n, r) => n + r.text.length, 0);
}

/** Splits at a plain-text offset; both halves keep their styles. */
export function splitRuns(runs: Run[], offset: number): [Run[], Run[]] {
  const head: Run[] = [];
  const tail: Run[] = [];
  let seen = 0;
  for (const r of runs) {
    const end = seen + r.text.length;
    if (end <= offset) head.push({ ...r });
    else if (seen >= offset) tail.push({ ...r });
    else {
      const cut = offset - seen;
      head.push({ ...r, text: r.text.slice(0, cut) });
      tail.push({ ...r, text: r.text.slice(cut) });
    }
    seen = end;
  }
  return [normalizeRuns(head), normalizeRuns(tail)];
}
