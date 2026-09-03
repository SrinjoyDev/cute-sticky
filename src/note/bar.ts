/**
 * The note's bottom toolbar: Bullets and Checklist toggles for the current
 * line (or every line in the selection), then Bold, Italic, Underline and
 * Strike. Active states follow the caret. CSS shows the bar while the note is
 * hovered or focused so a resting note stays clean.
 */

import { $$ } from '../shared/dom';
import { ICON } from '../shared/icons';
import type { Editor, FormatCommand } from './editor';

type ListType = 'bullet' | 'check';

const LISTS: { type: ListType; icon: string; title: string }[] = [
  {
    type: 'bullet',
    icon: ICON.bullets,
    title: 'Bullet list (or type "- " at the start of a line)',
  },
  {
    type: 'check',
    icon: ICON.checklist,
    title: 'Checklist (or type "[] " at the start of a line)',
  },
];

const STYLES: { cmd: FormatCommand; label: string; cls: string; title: string }[] = [
  { cmd: 'bold', label: 'B', cls: 'b', title: 'Bold (Ctrl+B)' },
  { cmd: 'italic', label: 'I', cls: 'i', title: 'Italic (Ctrl+I)' },
  { cmd: 'underline', label: 'U', cls: 'u', title: 'Underline (Ctrl+U)' },
  { cmd: 'strikeThrough', label: 'S', cls: 's', title: 'Strikethrough (Ctrl+Shift+S)' },
];

export function createBar(host: HTMLElement, editorRoot: HTMLElement, editor: Editor): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'toolbar');
  bar.innerHTML =
    LISTS.map(
      (l) =>
        `<button class="bb list" data-list="${l.type}" title="${l.title}" aria-label="${l.title}" tabindex="-1">${l.icon}</button>`,
    ).join('') +
    '<span class="sep"></span>' +
    STYLES.map(
      (s) =>
        `<button class="bb ${s.cls}" data-cmd="${s.cmd}" title="${s.title}" aria-label="${s.title}" tabindex="-1">${s.label}</button>`,
    ).join('');
  host.appendChild(bar);

  // Keep the selection and focus in the editor while clicking the bar.
  bar.addEventListener('mousedown', (ev) => ev.preventDefault());
  bar.addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('button');
    if (!button) return;
    if (button.dataset.list) editor.toggleList(button.dataset.list as ListType);
    else if (button.dataset.cmd) editor.format(button.dataset.cmd as FormatCommand);
    update();
  });

  function update(): void {
    const types = editor.selectionTypes();
    for (const button of $$('button.list', bar)) {
      const t = button.dataset.list;
      button.classList.toggle('on', types.length > 0 && types.every((x) => x === t));
    }
    const sel = getSelection();
    const inside = !!sel?.focusNode && editorRoot.contains(sel.focusNode);
    for (const button of $$('button[data-cmd]', bar)) {
      button.classList.toggle('on', inside && document.queryCommandState(button.dataset.cmd ?? ''));
    }
  }

  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update();
    });
  };
  document.addEventListener('selectionchange', schedule);
  editorRoot.addEventListener('input', schedule);
  update();
  return bar;
}
