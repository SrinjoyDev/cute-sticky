/** Typed wrappers around the Tauri commands and events the pages use. */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Color, Data, Note, PileOpen, Shape } from './types';

export const ipc = {
  listNotes: () => invoke<Data>('list_notes'),
  getNote: (id: string) => invoke<Note | null>('get_note', { id }),
  createNote: () => invoke<Note>('create_note'),
  updateNote: (id: string, patch: { content?: string; color?: Color; shape?: Shape }) =>
    invoke<void>('update_note', {
      id,
      content: patch.content ?? null,
      color: patch.color ?? null,
      shape: patch.shape ?? null,
    }),
  deleteNote: (id: string) => invoke<void>('delete_note', { id }),
  openNote: (id: string) => invoke<void>('open_note', { id }),
  closeNote: (id: string) => invoke<void>('close_note', { id }),
  setNotePinned: (id: string, pinned: boolean) => invoke<void>('set_note_pinned', { id, pinned }),
  hover: (source: 'tab' | 'pile', inside: boolean) => invoke<void>('hover', { source, inside }),
  pileHidden: () => invoke<void>('pile_hidden'),
  tabDrag: (top: number, done: boolean) => invoke<void>('tab_drag', { top, done }),
};

export const onNotesChanged = (cb: (data: Data) => void): Promise<UnlistenFn> =>
  listen<Data>('notes-changed', (e) => cb(e.payload));

export const onPileOpen = (cb: (payload: PileOpen) => void): Promise<UnlistenFn> =>
  listen<PileOpen>('pile-open', (e) => cb(e.payload));

export const onPileFold = (cb: () => void): Promise<UnlistenFn> => listen('pile-fold', () => cb());
