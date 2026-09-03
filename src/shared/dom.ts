/** Small DOM and formatting helpers shared by the three pages. */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

export function fmtAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.round(m)} min ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)} h ago`;
  const d = h / 24;
  if (d < 2) return 'yesterday';
  return `${Math.round(d)} days ago`;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  flush(...args: A): void;
  cancel(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = ((...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as Debounced<A>;
  wrapped.flush = (...args: A) => {
    clearTimeout(timer);
    fn(...args);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Behaviours every window wants: no browser context menu in production, no image dragging. */
export function installPageDefaults(): void {
  if (!import.meta.env.DEV) {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  document.addEventListener('dragstart', (e) => e.preventDefault());
}
