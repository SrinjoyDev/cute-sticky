/** Data shapes shared with the Rust side. Field names match the JSON (camelCase). */

export type Color = 'butter' | 'peach' | 'mint' | 'sky' | 'lilac' | 'rose';

/** Content rectangle of a note window in logical pixels, shadow margin excluded. */
export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Note {
  id: string;
  color: Color;
  content: string;
  pinned: boolean;
  open: boolean;
  window: WindowRect | null;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  /** Vertical centre of the tab as a fraction of the work-area height. */
  tabY: number;
  tabHidden: boolean;
}

export interface Data {
  version: number;
  settings: Settings;
  notes: Note[];
}

/** Card spacing for the pile, computed by Rust so the window and the page agree. */
export interface PileLayout {
  step: number;
  visibleH: number;
  totalH: number;
  push: number;
  width: number;
}

export interface PileOpen {
  data: Data;
  layout: PileLayout;
}
