# Contributing

Thanks for looking. Cute Sticky is small on purpose, so the bar for a change
is "does it keep the app light and the interaction smooth". Bug fixes and
polish are always welcome; new features are worth an issue first.

## Setup (Windows)

You need:

- [Node.js](https://nodejs.org) 22 or newer
- [Rust](https://rustup.rs) stable (rustup installs the MSVC toolchain)
- Visual Studio Build Tools 2022 with the **Desktop development with C++**
  workload (`winget install Microsoft.VisualStudio.2022.BuildTools`, then pick
  the workload in the installer)
- WebView2 runtime, which every Windows 11 machine already has

Then:

```powershell
npm install
npm run tauri dev
```

`tauri dev` starts Vite and the Rust shell together, with hot reload for the
pages. The tab appears on the right edge of your primary monitor. Debug builds
never register themselves to start with Windows; only release builds do.
Set `CUTE_STICKY_DEVTOOLS=1` to open devtools for each note window in debug.

### From WSL

The Rust and Node toolchains must run on the Windows side, and the working
tree must live on the Windows filesystem (cargo and file watching don't work
across `\\wsl$`). Keep the repo at, say, `C:\Users\you\cute-sticky`, symlink
it into your WSL home, and run commands through interop:

```bash
cmd.exe /c "cd /d C:\Users\you\cute-sticky && npm run tauri dev"
```

## Checks

Run all of these before opening a pull request; CI runs the same set.

```powershell
npm run lint        # tsc + prettier
npm test            # vitest: editor model, inline formatting, pile layout, editor DOM (jsdom)
npm run build       # production bundle of the three pages
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test          # store and geometry
```

`npm run format` fixes formatting.

## Where things live

```
src/shared/model.ts      editor model (pure, tested)
src/shared/layout.ts     pile card positions (pure, tested)
src/shared/ipc.ts        the commands and events the pages use
src/tab, src/pile, src/note   one page per window
src-tauri/src/store.rs   JSON store, atomic writes (tested)
src-tauri/src/geometry.rs window placement math (tested)
src-tauri/src/windows.rs create, place, show and hide windows
src-tauri/src/hover.rs   when the pile shows and hides
src-tauri/src/notes.rs   the commands
src-tauri/src/tray.rs    tray icon and menu
docs/superpowers/specs   the design document
docs/mockups             the interactive HTML mockup the design came from
```

Logic that can be pure goes in `model.ts`, `inline.ts`, `layout.ts`, `store.rs`
or `geometry.rs` with a test. The DOM and window code stays thin; the editor's
DOM layer has jsdom tests in `src/note/editor.test.ts`.

To poke at the editor in a normal browser without Tauri, build the harness
page and open it:

```powershell
npx vite build --config dev/vite.harness.config.ts
# then serve dev/dist with any static server and open harness.html
```

It mounts the editor and the formatting pill and mirrors every change into
`window.__last`.

## Style

- TypeScript: strict, no framework, Prettier formatting.
- Rust: `rustfmt` and `clippy` clean. Commands return `Result<_, String>`.
- Commits: short imperative subject, optional body explaining why.
- Copy in the UI: sentence case, plain verbs, no dialogs.

## Reporting bugs

Open an issue with your Windows version, display scaling, whether you have
more than one monitor, and what you expected to happen. A screenshot or short
recording of the tab and pile helps a lot.
