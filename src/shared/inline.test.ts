import { describe, expect, it } from 'vitest';
import {
  normalizeRuns,
  parseInline,
  plainText,
  run,
  serializeInline,
  splitRuns,
  type Run,
} from './inline';

const t = (text: string, s: Partial<Omit<Run, 'text'>> = {}): Run => run(text, s);

describe('parseInline / serializeInline', () => {
  it('plain text is one run', () => {
    expect(parseInline('hello world')).toEqual([t('hello world')]);
    expect(serializeInline([t('hello world')])).toBe('hello world');
  });

  it('round-trips each style', () => {
    const cases: [string, string, Partial<Omit<Run, 'text'>>][] = [
      ['**b**', 'b', { b: true }],
      ['*i*', 'i', { i: true }],
      ['__u__', 'u', { u: true }],
      ['~~s~~', 's', { s: true }],
    ];
    for (const [markup, inner, style] of cases) {
      const text = `a ${markup} z`;
      const runs = parseInline(text);
      expect(runs).toEqual([t('a '), t(inner, style), t(' z')]);
      expect(serializeInline(runs)).toBe(text);
    }
  });

  it('handles nested and overlapping styles', () => {
    const runs = parseInline('**bold *both* bold**');
    expect(runs).toEqual([
      t('bold ', { b: true }),
      t('both', { b: true, i: true }),
      t(' bold', { b: true }),
    ]);
    expect(parseInline(serializeInline(runs))).toEqual(runs);
    const overlap = [t('a', { i: true }), t('b', { b: true }), t('c', { i: true })];
    expect(parseInline(serializeInline(overlap))).toEqual(overlap);
  });

  it('treats unbalanced markers as literal text', () => {
    expect(parseInline('5 * 3 = 15')).toEqual([t('5 * 3 = 15')]);
    expect(parseInline('snake_case and _single_')).toEqual([t('snake_case and _single_')]);
    expect(parseInline('a ~~ b')).toEqual([t('a ~~ b')]);
    expect(parseInline('trailing **')).toEqual([t('trailing **')]);
  });

  it('escapes literal marker characters so they survive a round trip', () => {
    const runs = [t('rate: 5 * 3, file_name, a~~b, back\\slash')];
    const text = serializeInline(runs);
    expect(text).toBe('rate: 5 \\* 3, file_name, a\\~~b, back\\slash');
    expect(parseInline(text)).toEqual(runs);
  });

  it('escapes underscores only when they would pair up', () => {
    expect(serializeInline([t('__init__')])).toBe('\\_\\_init\\_\\_');
    expect(parseInline('\\_\\_init\\_\\_')).toEqual([t('__init__')]);
  });

  it('plainText strips markup', () => {
    expect(plainText('**Groceries** for *tonight*')).toBe('Groceries for tonight');
    expect(plainText('')).toBe('');
  });
});

describe('splitRuns', () => {
  it('splits inside a styled run and keeps the style on both sides', () => {
    const [head, tail] = splitRuns([t('bold text', { b: true })], 4);
    expect(head).toEqual([t('bold', { b: true })]);
    expect(tail).toEqual([t(' text', { b: true })]);
  });

  it('splits on a run boundary and at the ends', () => {
    const runs = [t('ab'), t('cd', { i: true })];
    expect(splitRuns(runs, 2)).toEqual([[t('ab')], [t('cd', { i: true })]]);
    expect(splitRuns(runs, 0)).toEqual([[], runs]);
    expect(splitRuns(runs, 4)).toEqual([runs, []]);
    expect(splitRuns(runs, 99)).toEqual([runs, []]);
  });
});

describe('normalizeRuns', () => {
  it('drops empty runs and merges neighbours with the same style', () => {
    expect(normalizeRuns([t(''), t('a', { b: true }), t('b', { b: true }), t('c')])).toEqual([
      t('ab', { b: true }),
      t('c'),
    ]);
  });
});
