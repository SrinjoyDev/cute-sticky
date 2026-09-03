/**
 * The formatting pill: appears just above a text selection inside the editor
 * with Bold, Italic, Underline and Strike buttons that reflect the selection's
 * current styles. Hidden whenever the selection collapses or leaves the editor.
 */

import { $$, clamp } from '../shared/dom';
import type { Editor, FormatCommand } from './editor';

const BUTTONS: { cmd: FormatCommand; label: string; cls: string; title: string }[] = [
  { cmd: 'bold', label: 'B', cls: 'b', title: 'Bold (Ctrl+B)' },
  { cmd: 'italic', label: 'I', cls: 'i', title: 'Italic (Ctrl+I)' },
  { cmd: 'underline', label: 'U', cls: 'u', title: 'Underline (Ctrl+U)' },
  { cmd: 'strikeThrough', label: 'S', cls: 's', title: 'Strikethrough (Ctrl+Shift+S)' },
];

export function createToolbar(host: HTMLElement, editorRoot: HTMLElement, editor: Editor): void {
  const pill = document.createElement('div');
  pill.className = 'fmt';
  pill.setAttribute('role', 'toolbar');
  pill.innerHTML = BUTTONS.map(
    (b) =>
      `<button class="${b.cls}" data-cmd="${b.cmd}" title="${b.title}" aria-label="${b.title}" tabindex="-1">${b.label}</button>`,
  ).join('');
  host.appendChild(pill);

  // Keep the selection and focus in the editor while clicking the pill.
  pill.addEventListener('mousedown', (ev) => ev.preventDefault());
  pill.addEventListener('click', (ev) => {
    const button = (ev.target as HTMLElement).closest<HTMLElement>('button');
    const cmd = button?.dataset.cmd as FormatCommand | undefined;
    if (!cmd) return;
    editor.format(cmd);
    update();
  });

  const hide = () => pill.classList.remove('on');

  function update(): void {
    const sel = getSelection();
    if (
      !sel ||
      sel.rangeCount === 0 ||
      sel.isCollapsed ||
      !editorRoot.contains(sel.anchorNode) ||
      !editorRoot.contains(sel.focusNode)
    ) {
      hide();
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      hide();
      return;
    }
    for (const button of $$('button', pill)) {
      button.classList.toggle('on', document.queryCommandState(button.dataset.cmd ?? ''));
    }
    pill.classList.add('on');
    const hostRect = host.getBoundingClientRect();
    const w = pill.offsetWidth;
    const h = pill.offsetHeight;
    const left = clamp(
      rect.left + rect.width / 2 - hostRect.left - w / 2,
      6,
      hostRect.width - w - 6,
    );
    let top = rect.top - hostRect.top - h - 8;
    if (top < 4) top = rect.bottom - hostRect.top + 8;
    pill.style.left = `${left}px`;
    pill.style.top = `${top}px`;
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
  window.addEventListener('resize', schedule);
  editorRoot.addEventListener('blur', hide);
}
