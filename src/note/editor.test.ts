// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Block } from '../shared/model';
import { createEditor } from './editor';

const p = (text: string): Block => ({ type: 'p', text, done: false });
const b = (text: string): Block => ({ type: 'bullet', text, done: false });

function mount(blocks: Block[]) {
  document.body.innerHTML = '<div class="note"><div class="nb"></div></div>';
  const root = document.querySelector<HTMLElement>('.nb')!;
  const onChange = vi.fn();
  const editor = createEditor(root, blocks, onChange);
  return { root, editor, onChange };
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const sel = getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

const textOf = (root: HTMLElement, i: number) => root.children[i].querySelector('.tx')!;

beforeEach(() => {
  (document as unknown as { execCommand?: unknown }).execCommand ??= () => true;
});

describe('editor DOM layer', () => {
  it('renders one row per block with a marker and a text span', () => {
    const { root } = mount([p('hello'), b('item')]);
    expect(root.children).toHaveLength(2);
    expect(root.children[0].className).toBe('blk p');
    expect(root.children[1].className).toBe('blk bullet');
    expect(textOf(root, 1).textContent).toBe('item');
    expect(root.querySelector('.mk')?.getAttribute('contenteditable')).toBe('false');
  });

  it('typing into a row reaches onChange with the new text', () => {
    const { root, onChange } = mount([p('')]);
    const tx = textOf(root, 0);
    tx.replaceChildren(document.createTextNode('Ti'));
    placeCaret(tx.firstChild!, 2);
    root.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([p('Ti')]);
  });

  it('Enter splits the block at the caret', () => {
    const { root, onChange } = mount([p('hello world')]);
    placeCaret(textOf(root, 0).firstChild!, 5);
    const ev = new InputEvent('beforeinput', {
      inputType: 'insertParagraph',
      bubbles: true,
      cancelable: true,
    });
    root.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith([p('hello'), p(' world')]);
    expect(root.children).toHaveLength(2);
  });

  it('a "- " prefix turns the row into a bullet', () => {
    const { root, onChange } = mount([p('')]);
    const tx = textOf(root, 0);
    tx.replaceChildren(document.createTextNode('- milk'));
    placeCaret(tx.firstChild!, 6);
    root.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith([b('milk')]);
    expect(root.children[0].className).toBe('blk bullet');
  });

  it('repairs a stray text node the browser left outside any row', () => {
    const { root, onChange } = mount([p('a')]);
    root.appendChild(document.createTextNode('stray'));
    root.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith([p('a'), p('stray')]);
    expect(root.children).toHaveLength(2);
    expect(root.childNodes).toHaveLength(2);
  });

  it('reads inline formatting back out of the DOM', () => {
    const { root, onChange } = mount([p('plain')]);
    const tx = textOf(root, 0);
    tx.innerHTML = 'a <b>bold <i>both</i></b> z';
    placeCaret(tx.firstChild!, 1);
    root.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith([p('a **bold *****both*** z')]);
  });

  it('an empty note stays one empty paragraph after everything is deleted', () => {
    const { root, onChange } = mount([p('a'), p('b')]);
    root.replaceChildren();
    root.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenLastCalledWith([p('')]);
    expect(root.children).toHaveLength(1);
  });

  it('toggleList turns the caret line into a checklist item and back', () => {
    const { root, editor, onChange } = mount([p('a'), p('b')]);
    placeCaret(textOf(root, 1).firstChild!, 1);
    editor.toggleList('check');
    expect(onChange).toHaveBeenLastCalledWith([p('a'), { type: 'check', text: 'b', done: false }]);
    expect(root.children[1].className).toBe('blk check');
    expect(editor.selectionTypes()).toEqual(['check']);
    editor.toggleList('check');
    expect(onChange).toHaveBeenLastCalledWith([p('a'), p('b')]);
  });

  it('toggleList covers every line in a selection', () => {
    const { root, editor, onChange } = mount([p('a'), p('b'), p('c')]);
    const range = document.createRange();
    range.setStart(textOf(root, 0).firstChild!, 0);
    range.setEnd(textOf(root, 2).firstChild!, 1);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    editor.toggleList('bullet');
    expect(onChange).toHaveBeenLastCalledWith([b('a'), b('b'), b('c')]);
  });
});
