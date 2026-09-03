# Cute Sticky — design

Date: 2026-09-03
Status: approved (interaction design validated with the HTML mockup in `docs/mockups/`)

## What it is

A tiny always-on-top sticky notes app for Windows 11. A slim vertical tab of
coloured dots lives on the right edge of the primary monitor. Hovering the tab
deals the notes out beside it as a pile of small cards. Hovering a card slides
it out to peek; clicking it opens the note as its own floating window. Notes
hold plain text with bullets and checkboxes. Everything saves as you type.

Goals, in order: lightweight, smooth, cute, simple.

Non-goals for v0.1: sync, rich text beyond bullets and checkboxes, search,
multi-monitor placement, themes, mobile, Linux or macOS builds.

## Stack

- Tauri 2 (Rust shell, WebView2 renderer). Built and run on Windows.
- Frontend: TypeScript, Vite, no framework. Three small pages (tab, pile, note)
  share a few modules.
- Plugins: `tauri-plugin-autostart`, `tauri-plugin-single-instance`.
- Fonts: Nunito is bundled (woff2) so the app looks the same on every machine.

Development happens from WSL with the working tree on the Windows filesystem
(`C:\Users\<you>\cute-sticky`, symlinked from `~/cute-sticky`). Node and Rust
run on the Windows side through interop.

## Windows

All windows are frameless, transparent, hidden from the taskbar, and drawn with
CSS (rounded corners, soft shadows). Sizes below are logical pixels; Rust
converts with the monitor scale factor.

### `tab`

- Always present while the app runs, unless hidden from the tray.
- Size 30 × (16 + 13·n) with n = min(notes, 8), minimum height 26. The extra
  8 px on the left is transparent room for the shadow.
- Flush with the right edge of the primary monitor's work area, vertical
  centre at `settings.tabY` (a fraction of the work-area height), clamped so
  the tab stays inside the work area.
- One 8 px dot per note in note order (oldest at top), colour of the note. Open
  notes show a white core. More than 8 notes shows the first 8 plus a `+n`.
  No notes shows one hollow dot.
- Always on top, never focused on show (`focusable: false`).
- Hover → tell Rust; it waits 150 ms of intent before showing the pile. Click a dot → open that note.
  Press and drag vertically → the tab follows the cursor; release saves
  `tabY`.

### `pile`

- Created hidden at startup, shown and hidden by Rust. Never focused.
- Size (170 + 18 + 4) × total, positioned to the left of the tab with an 8 px
  gap, vertically centred on the tab's centre, clamped to the work area.
- Cards are 170 × 110, stacked with a step of 22–38 px (shrinks when many
  notes so the pile fits the screen), each with a ±1° tilt. Card i sits at
  y = i·step. Below the last card sits a 34 px dashed "New note" card.
- Visible height = (n−1)·step + 110 + 6 + 34. Total height adds the push room
  (110 − step + 6) so a peeked card can push the cards below it down.
- Deal-in: cards start at the vertical centre, translated 26 px right and
  faded; they spring to place with a 20 ms stagger. Fold reverses it.
- Hover a card: it slides 18 px left, scales to 1.03, jumps to the top, and
  every card below it (and the new-note card) translates down by the push
  room. A trash icon appears in its top-right corner.
- Click a card → open the note; the pile hides immediately.
- Trash icon → inline confirm. First click turns it into a "Delete?" pill for
  3 s; second click deletes. Same control lives in note windows.
- The pile hides 250 ms after the cursor leaves both the tab and the pile.
  Rust owns this state machine (`hover.rs`) with a 400 ms cursor-position
  safety check so the pile can't get stuck open.

### `note-<id>`

- One window per open note, created on demand. Default 270 × 230 content plus
  a 16 px transparent margin on every side for the CSS shadow.
- First open places the note left of the tab, cascading 26 px per already open
  note. Position and size persist per note in logical pixels (content rect,
  margin excluded).
- Always on top when pinned (default). Unpinned notes behave like normal
  windows. Pin toggle in the header.
- Header: colour swatch (click → six-swatch popover), drag region, pin, trash
  (inline confirm), close. Body: block editor. Bottom-right resize grip drives
  a native resize drag.
- Opens with a 260 ms spring scale-in from the right; closes with a 160 ms
  fade. Rust closes the window after the fade.
- On relaunch, every note with `open: true` is recreated at its saved rect.

## Editor

Content is stored as text, one block per line, with inline markup inside a line:

```
plain line with **bold**, *italic*, __underline__ and ~~strike~~
- bullet
- [ ] task
- [x] done task
```

`src/shared/inline.ts` turns a line's markup into runs (stretches of text
sharing one style) and back. Literal `*`, `~~` and paired `_` are escaped
with a backslash; unbalanced markers are read as plain text, so notes written
before formatting existed keep their meaning. `src/shared/model.ts` is the
pure block layer: `parse`, `serialize`, `previewLines` (plain words for cards
and tooltips) and the edit operations `splitAt`, `backspaceAtStart`,
`deleteAtEnd`, `applyShortcut`, `toggleDone`, all taking plain-text offsets.

The DOM layer (`src/note/editor.ts`) is one `contenteditable` root holding one
row per block: a non-editable marker (nothing, a dot, or a checkbox button)
and a text span with `<b>`, `<i>`, `<u>`, `<s>`. Because there is a single
editable area, Ctrl+A, drag-select, copy, cut and deleting a selection that
spans lines are the browser's own behaviour. The editor intercepts:

- Enter (and Shift+Enter) → `splitAt`; an empty list item turns back into a
  plain line.
- Backspace at the start of a line → `backspaceAtStart`; Delete at the end of
  a line → `deleteAtEnd`.
- Paste → plain text only; one line is inserted natively, several lines become
  one block per line (a `- ` or `- [ ]` prefix on a pasted line is honoured,
  the rest of the line is kept literal).
- Typing `- `, `* `, `[] `, `[ ] ` or `[x] ` at the start of a line converts it.
- Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+S toggle inline styles through
  `document.execCommand`, as does the selection pill.

After every input the model is re-read from the DOM; if the browser left a
shape the editor does not render (stray nodes, nested rows, a newline in a
text node) the rows are rebuilt from the model and the caret restored.

The selection pill (`src/note/toolbar.ts`) appears above any non-empty
selection inside the editor with B, I, U and S buttons whose active state
mirrors `queryCommandState`, and hides when the selection collapses or leaves
the editor.

Edits save through `update_note` debounced at 150 ms. The store's own write
debounce (300 ms) coalesces further.

## Data

`%APPDATA%\com.srinjoy.cutesticky\notes.json`:

```json
{
  "version": 1,
  "settings": { "tabY": 0.36, "tabHidden": false, "autostart": true },
  "notes": [
    {
      "id": "k3v9x2mq1a",
      "color": "butter",
      "content": "Groceries\n- [x] oat milk\n- [ ] eggs",
      "pinned": true,
      "open": true,
      "window": { "x": 1180, "y": 320, "w": 270, "h": 230 },
      "createdAt": 1756915200000,
      "updatedAt": 1756918800000
    }
  ]
}
```

- Colours: `butter #FFE9A8`, `peach #FFD3C2`, `mint #CFEFDD`, `sky #CDE6FA`,
  `lilac #E3D7F7`, `rose #FBD5E3`. New notes cycle through them.
- Writes are atomic: write `notes.json.tmp`, then rename over `notes.json`.
- Saves are debounced 300 ms in the store and flushed on exit.
- A file that fails to parse is moved to `notes.json.bad-<timestamp>` and the
  app starts empty, logging the error. Data is never silently overwritten.

## IPC

Commands (frontend → Rust):

| command           | args                                 | effect                                          |
| ----------------- | ------------------------------------ | ----------------------------------------------- |
| `list_notes`      |                                      | notes + settings snapshot                       |
| `get_note`        | id                                   | one note                                        |
| `create_note`     |                                      | new note in the next colour, opened, returns it |
| `update_note`     | id, content?, color?                 | persist edits, bump `updatedAt`                 |
| `delete_note`     | id                                   | remove, close its window                        |
| `open_note`       | id                                   | create or focus its window                      |
| `close_note`      | id                                   | mark closed, close its window                   |
| `set_note_pinned` | id, pinned                           | toggle always-on-top                            |
| `hover`           | source (`tab`/`pile`), inside (bool) | feed the hover machine                          |
| `pile_hidden`     |                                      | pile finished its fold animation                |
| `tab_drag`        | top (logical px), done (bool)        | move the tab; persist `tabY` when done          |

Events (Rust → windows):

- `notes-changed` with the full snapshot, to every window. Tab and pile
  re-render; a note window applies external changes (colour, deletion).
- `pile-open`, `pile-fold` to the pile.

## Rust layout

```
src-tauri/src/
  main.rs      entry, calls cute_sticky_lib::run()
  lib.rs       builder: plugins, state, setup, command registration
  store.rs     Store, Note, Settings; load/save; debounced flush   (tests)
  geometry.rs  pure rect math for tab, pile, note placement        (tests)
  windows.rs   create/show/hide/position the tab, pile, note windows
  hover.rs     hover state machine and timers
  notes.rs     the note commands
  tray.rs      tray icon and menu
```

State is `Mutex<Store>` inside `AppState`, plus the hover machine. Every
mutation goes through the store, which schedules a flush and returns the
snapshot the caller emits as `notes-changed`.

## Tray

Menu: New note · Show tab / Hide tab · Start with Windows (check) · Quit.
`settings.autostart` defaults to true; release builds re-register the
autostart entry on every launch so it always points at the current exe, and
debug builds never touch it.
Left click also opens the menu. Quit flushes the store first. A second app
instance forwards to the first, which shows the tab if hidden.

## Error handling

- Store I/O errors surface as `Result<_, String>` from commands and a log line;
  the UI keeps working from memory.
- Missing primary monitor falls back to the first monitor; none at all defers
  window creation until one appears.
- A note window whose saved rect is off every monitor is re-placed at the
  default position.

## Testing

- `cargo test`: store round-trip, atomic write, corrupt-file quarantine,
  geometry clamping and placement.
- `npm test` (Vitest): model parse/serialize and every edit operation, inline
  markup round trips and escaping, pile layout math, and the editor's DOM layer
  under jsdom (rows, typing, Enter, shortcuts, repair of stray nodes).
- Manual on Windows before each release: the ten stages of the mockup.
- CI on `windows-latest` runs both test suites, clippy, rustfmt, and a build.

## Repository

MIT licence. README with screenshots, features, install, build-from-source,
and a short "how it works". CONTRIBUTING with the dev loop. GitHub Actions for
CI and tagged releases (NSIS installer as a release asset).
