import { describe, expect, it } from 'vitest';
import {
  applyShortcut,
  backspaceAtStart,
  firstLine,
  parse,
  previewLines,
  serialize,
  splitAt,
  toggleDone,
  type Block,
} from './model';

const p = (text: string): Block => ({ type: 'p', text, done: false });
const b = (text: string): Block => ({ type: 'bullet', text, done: false });
const c = (text: string, done = false): Block => ({ type: 'check', text, done });

describe('parse / serialize', () => {
  it('parses every block kind and round-trips', () => {
    const text = 'Groceries\n- oat milk\n- [ ] eggs\n- [x] limes';
    expect(parse(text)).toEqual([p('Groceries'), b('oat milk'), c('eggs'), c('limes', true)]);
    expect(serialize(parse(text))).toBe(text);
  });

  it('empty text is one empty paragraph', () => {
    expect(parse('')).toEqual([p('')]);
    expect(serialize([p('')])).toBe('');
  });

  it('keeps blank lines as empty paragraphs', () => {
    expect(parse('a\n\nb')).toEqual([p('a'), p(''), p('b')]);
  });

  it('accepts * bullets and uppercase X when parsing', () => {
    expect(parse('* one\n- [X] two')).toEqual([b('one'), c('two', true)]);
  });
});

describe('previewLines', () => {
  it('adds markers and skips empty blocks', () => {
    const blocks = [p(''), p('Title'), b('one'), c('two'), c('three', true)];
    expect(previewLines(blocks, 3)).toEqual(['Title', '• one', '☐ two']);
    expect(previewLines(blocks, 5)).toEqual(['Title', '• one', '☐ two', '☑ three']);
  });

  it('firstLine falls back to Empty note', () => {
    expect(firstLine('')).toBe('Empty note');
    expect(firstLine('\n- [ ] eggs')).toBe('☐ eggs');
  });
});

describe('applyShortcut', () => {
  it('turns "- " into a bullet', () => {
    expect(applyShortcut(p('- milk'))).toEqual(b('milk'));
    expect(applyShortcut(p('* milk'))).toEqual(b('milk'));
  });

  it('turns "[] " and "[x] " into checkboxes, from paragraphs and bullets', () => {
    expect(applyShortcut(p('[] eggs'))).toEqual(c('eggs'));
    expect(applyShortcut(p('[ ] eggs'))).toEqual(c('eggs'));
    expect(applyShortcut(p('[x] eggs'))).toEqual(c('eggs', true));
    expect(applyShortcut(b('[] eggs'))).toEqual(c('eggs'));
  });

  it('returns null when nothing matches', () => {
    expect(applyShortcut(p('plain'))).toBeNull();
    expect(applyShortcut(c('[] nested'))).toBeNull();
  });
});

describe('splitAt', () => {
  it('splits a paragraph at the caret', () => {
    const r = splitAt([p('hello world')], 0, 5);
    expect(r.blocks).toEqual([p('hello'), p(' world')]);
    expect(r.focus).toBe(1);
  });

  it('continues a list with the same kind, unchecked', () => {
    const r = splitAt([c('done', true)], 0, 4);
    expect(r.blocks).toEqual([c('done', true), c('')]);
  });

  it('an empty list item leaves the list instead of splitting', () => {
    const r = splitAt([b('a'), b('')], 1, 0);
    expect(r.blocks).toEqual([b('a'), p('')]);
    expect(r.focus).toBe(1);
  });
});

describe('backspaceAtStart', () => {
  it('turns a list item back into a paragraph', () => {
    const r = backspaceAtStart([c('eggs', true)], 0);
    expect(r.blocks).toEqual([p('eggs')]);
    expect(r).toMatchObject({ focus: 0, caret: 0 });
  });

  it('merges a paragraph into the previous block and reports the join caret', () => {
    const r = backspaceAtStart([b('abc'), p('def')], 1);
    expect(r.blocks).toEqual([b('abcdef')]);
    expect(r).toMatchObject({ focus: 0, caret: 3 });
  });

  it('does nothing on the first paragraph', () => {
    const r = backspaceAtStart([p('abc')], 0);
    expect(r.blocks).toEqual([p('abc')]);
  });
});

describe('toggleDone', () => {
  it('flips a checkbox and leaves others alone', () => {
    expect(toggleDone([c('a'), c('b')], 1)).toEqual([c('a'), c('b', true)]);
    expect(toggleDone([p('x')], 0)).toEqual([p('x')]);
  });
});
