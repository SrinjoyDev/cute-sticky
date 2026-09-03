/** Standalone page for exercising the note editor in a plain browser (no Tauri). */
import '../src/shared/theme.css';
import '../src/note/note.css';
import { createEditor } from '../src/note/editor';
import { createToolbar } from '../src/note/toolbar';
import { parse, serialize } from '../src/shared/model';

declare global {
  interface Window {
    __last: string;
    __log: string[];
  }
}

const note = document.createElement('div');
note.className = 'note';
note.innerHTML = '<div class="nh"><div class="grip"></div></div><div class="nb"></div>';
document.body.appendChild(note);
window.__log = [];
window.__last = '';
const body = note.querySelector<HTMLElement>('.nb')!;
const editor = createEditor(
  body,
  parse(new URLSearchParams(location.search).get('text') ?? ''),
  (blocks) => {
    window.__last = serialize(blocks);
    window.__log.push(window.__last);
  },
);
createToolbar(note, body, editor);
editor.focusEnd();
