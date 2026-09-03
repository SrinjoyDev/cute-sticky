/**
 * Standalone page for exercising the note in a plain browser (no Tauri).
 *
 *   harness.html                one editable note; changes mirror into window.__last
 *   harness.html?shape=cloud    the same, with a shape
 *   harness.html?gallery        every shape side by side with sample text
 */
import '../src/shared/theme.css';
import '../src/note/note.css';
import { createBar } from '../src/note/bar';
import { createEditor } from '../src/note/editor';
import { applyShape, createNoteShell } from '../src/note/shell';
import { parse, serialize } from '../src/shared/model';
import { SHAPES, shapeDefsSVG } from '../src/shared/shapes';
import type { Shape } from '../src/shared/types';

declare global {
  interface Window {
    __last: string;
    __log: string[];
  }
}

const params = new URLSearchParams(location.search);
document.body.insertAdjacentHTML('afterbegin', shapeDefsSVG());
window.__log = [];
window.__last = '';

function place(el: HTMLElement, x: number, y: number, w: number, h: number) {
  el.style.inset = 'auto';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

const SAMPLE = 'Groceries\n- [x] oat milk\n- [ ] eggs\n- limes and **coriander**';

function mountNote(shape: Shape, text: string, x: number, y: number, w: number, h: number) {
  const el = createNoteShell({ color: 'butter', shape, pinned: true });
  place(el, x, y, w, h);
  document.body.appendChild(el);
  const body = el.querySelector<HTMLElement>('.nb')!;
  const inner = el.querySelector<HTMLElement>('.inner')!;
  const editor = createEditor(body, parse(text), (blocks) => {
    window.__last = serialize(blocks);
    window.__log.push(window.__last);
  });
  createBar(inner, body, editor);
  el.querySelector('.shp')!.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('.sho');
    if (b?.dataset.shape) applyShape(el, b.dataset.shape as Shape);
  });
  el.querySelector('.shape')!.addEventListener('click', () =>
    el.querySelector('.shp')!.classList.toggle('open'),
  );
  return editor;
}

if (params.has('gallery')) {
  const colors = ['butter', 'mint', 'sky', 'rose', 'lilac'] as const;
  SHAPES.forEach((s, i) => {
    const el = createNoteShell({ color: colors[i], shape: s.id, pinned: true });
    const [w, h] = s.minWindow;
    place(el, 20 + i * 340, 40, w - 32, h - 32);
    document.body.appendChild(el);
    const body = el.querySelector<HTMLElement>('.nb')!;
    const editor = createEditor(body, parse(SAMPLE), () => {});
    createBar(el.querySelector<HTMLElement>('.inner')!, body, editor);
  });
} else {
  const shape = (params.get('shape') as Shape | null) ?? 'square';
  const editor = mountNote(shape, params.get('text') ?? '', 40, 40, 300, 260);
  editor.focusEnd();
}
