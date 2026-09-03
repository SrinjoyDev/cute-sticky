//! Creating, placing, showing and hiding the tab, pile and note windows.

use std::sync::atomic::Ordering;

use tauri::{
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::geometry::{
    default_note_rect, intersects, note_window_rect, pile_layout, pile_rect, tab_rect, PileLayout, Rect,
    CARD_W, GHOST_H, NOTE_MARGIN, PEEK, PILE_PAD, TAB_MIN_H, TAB_WINDOW_W,
};
use crate::store::{Data, Note, DEFAULT_NOTE_H, DEFAULT_NOTE_W};
use crate::AppState;

/// Windows widens any window that carries caption styles to a system minimum of
/// about 132 logical pixels, which would push the 30 px tab off screen. Tao keeps
/// those styles even for undecorated windows, so the tab and pile are turned into
/// plain popup windows after creation and again before every resize.
#[cfg(windows)]
mod win32 {
    use std::ffi::c_void;

    type Hwnd = *mut c_void;
    const GWL_STYLE: i32 = -16;
    const WS_POPUP: isize = 0x8000_0000;
    const WS_CAPTION: isize = 0x00C0_0000;
    const WS_SYSMENU: isize = 0x0008_0000;
    const WS_MINIMIZEBOX: isize = 0x0002_0000;
    const WS_MAXIMIZEBOX: isize = 0x0001_0000;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOZORDER: u32 = 0x0004;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_FRAMECHANGED: u32 = 0x0020;

    #[link(name = "user32")]
    extern "system" {
        fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
        fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> i32;
    }

    pub fn make_popup(window: &tauri::WebviewWindow) {
        let Ok(hwnd) = window.hwnd() else {
            return;
        };
        let hwnd = hwnd.0 as isize as Hwnd;
        // SAFETY: plain user32 calls on a window handle owned by this process.
        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            let wanted = (style & !(WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX)) | WS_POPUP;
            if wanted != style {
                SetWindowLongPtrW(hwnd, GWL_STYLE, wanted);
                SetWindowPos(
                    hwnd,
                    std::ptr::null_mut(),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
                );
            }
        }
    }
}

fn make_popup(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    win32::make_popup(window);
    #[cfg(not(windows))]
    let _ = window;
}

pub const TAB: &str = "tab";
pub const PILE: &str = "pile";

pub fn note_label(id: &str) -> String {
    format!("note-{id}")
}

/// Work area of the primary monitor in logical pixels.
pub fn work_area(app: &AppHandle) -> Rect {
    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| app.available_monitors().ok().and_then(|m| m.into_iter().next()));
    match monitor {
        Some(m) => {
            let s = m.scale_factor();
            let wa = m.work_area();
            Rect {
                x: wa.position.x as f64 / s,
                y: wa.position.y as f64 / s,
                w: wa.size.width as f64 / s,
                h: wa.size.height as f64 / s,
            }
        }
        None => Rect {
            x: 0.0,
            y: 0.0,
            w: 1280.0,
            h: 720.0,
        },
    }
}

/// Current logical rect of a window, if it exists.
fn window_rect(app: &AppHandle, label: &str) -> Option<Rect> {
    let w = app.get_webview_window(label)?;
    let s = w.scale_factor().ok()?;
    let p = w.outer_position().ok()?;
    let z = w.inner_size().ok()?;
    Some(Rect {
        x: p.x as f64 / s,
        y: p.y as f64 / s,
        w: z.width as f64 / s,
        h: z.height as f64 / s,
    })
}

fn set_rect(app: &AppHandle, label: &str, r: &Rect) {
    if let Some(w) = app.get_webview_window(label) {
        if label == TAB || label == PILE {
            make_popup(&w);
        }
        let _ = w.set_size(Size::Logical(LogicalSize::new(r.w, r.h)));
        let _ = w.set_position(Position::Logical(LogicalPosition::new(r.x, r.y)));
    }
}

fn settings_tab_rect(app: &AppHandle) -> (Rect, bool) {
    let area = work_area(app);
    let state = app.state::<AppState>();
    let store = state.store.lock().unwrap();
    let d = store.data();
    (
        tab_rect(&area, d.settings.tab_y, d.notes.len()),
        d.settings.tab_hidden,
    )
}

pub fn create_tab(app: &AppHandle) -> tauri::Result<()> {
    let (r, hidden) = settings_tab_rect(app);
    WebviewWindowBuilder::new(app, TAB, WebviewUrl::App("tab.html".into()))
        .title("Cute Sticky")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focusable(false)
        .focused(false)
        .visible(!hidden)
        // Windows widens caption-style windows to ~132 px unless a minimum is declared.
        .min_inner_size(TAB_WINDOW_W, TAB_MIN_H)
        .position(r.x, r.y)
        .inner_size(r.w, r.h)
        .build()?;
    set_rect(app, TAB, &r);
    Ok(())
}

/// Re-fits the tab to the note count, keeping its centre where it is.
pub fn layout_tab(app: &AppHandle) {
    let (r, _) = settings_tab_rect(app);
    set_rect(app, TAB, &r);
}

pub fn set_tab_hidden(app: &AppHandle, hidden: bool) {
    {
        let state = app.state::<AppState>();
        state.store.lock().unwrap().settings_mut().tab_hidden = hidden;
    }
    if let Some(w) = app.get_webview_window(TAB) {
        let _ = if hidden { w.hide() } else { w.show() };
        make_popup(&w);
    }
    if hidden {
        crate::hover::force_hide(app);
    }
    crate::tray::refresh(app);
    crate::schedule_flush(app);
}

/// Moves the tab so its top is at `top` (clamped), and persists on release.
pub fn tab_drag(app: &AppHandle, top: f64, done: bool) {
    let area = work_area(app);
    let Some(cur) = window_rect(app, TAB) else {
        return;
    };
    let lo = area.y + 4.0;
    let hi = (area.bottom() - cur.h - 4.0).max(lo);
    let y = top.clamp(lo, hi);
    set_rect(app, TAB, &Rect { y, ..cur });
    if done {
        let state = app.state::<AppState>();
        state.store.lock().unwrap().settings_mut().tab_y = (y + cur.h / 2.0 - area.y) / area.h;
        crate::schedule_flush(app);
    }
}

pub fn create_pile(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, PILE, WebviewUrl::App("pile.html".into()))
        .title("Cute Sticky")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focusable(false)
        .focused(false)
        .visible(false)
        .min_inner_size(CARD_W + PEEK + PILE_PAD, GHOST_H)
        .position(0.0, 0.0)
        .inner_size(CARD_W + PEEK + PILE_PAD, 200.0)
        .build()?;
    if let Some(w) = app.get_webview_window(PILE) {
        make_popup(&w);
    }
    Ok(())
}

/// Sizes and places the pile next to the tab, tells the page to deal, and shows it.
pub fn show_pile(app: &AppHandle) {
    let area = work_area(app);
    let (data, tab) = {
        let state = app.state::<AppState>();
        let store = state.store.lock().unwrap();
        let tab = window_rect(app, TAB)
            .unwrap_or_else(|| tab_rect(&area, store.data().settings.tab_y, store.notes().len()));
        (store.snapshot(), tab)
    };
    let layout = pile_layout(data.notes.len(), area.h);
    let r = pile_rect(&area, &tab, &layout);
    set_rect(app, PILE, &r);
    emit_pile_open(app, &data, &layout);
    if let Some(w) = app.get_webview_window(PILE) {
        let _ = w.show();
    }
}

#[derive(Clone, serde::Serialize)]
struct PileOpen<'a> {
    data: &'a Data,
    layout: &'a PileLayout,
}

pub fn emit_pile_open(app: &AppHandle, data: &Data, layout: &PileLayout) {
    let _ = app.emit_to(EventTarget::labeled(PILE), "pile-open", PileOpen { data, layout });
}

pub fn fold_pile(app: &AppHandle) {
    let _ = app.emit_to(EventTarget::labeled(PILE), "pile-fold", ());
}

pub fn pile_is_visible(app: &AppHandle) -> bool {
    app.get_webview_window(PILE)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

pub fn hide_pile(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(PILE) {
        let _ = w.hide();
    }
}

/// True when the cursor is over the tab or the visible pile. Errs on the side of "over".
pub fn cursor_over_dock(app: &AppHandle) -> bool {
    let Ok(cursor) = app.cursor_position() else {
        return true;
    };
    let over = |label: &str| {
        let Some(w) = app.get_webview_window(label) else {
            return false;
        };
        if !w.is_visible().unwrap_or(false) {
            return false;
        }
        let (Ok(p), Ok(z)) = (w.outer_position(), w.inner_size()) else {
            return false;
        };
        cursor.x >= p.x as f64
            && cursor.x < (p.x + z.width as i32) as f64
            && cursor.y >= p.y as f64
            && cursor.y < (p.y + z.height as i32) as f64
    };
    over(TAB) || over(PILE)
}

/// Creates the note's window at its saved rect, or a fresh cascaded spot, and
/// returns the content rect it was given. Focuses the window if it already exists.
pub fn open_note_window(app: &AppHandle, note: &Note) -> tauri::Result<Option<Rect>> {
    let label = note_label(&note.id);
    if let Some(w) = app.get_webview_window(&label) {
        w.show()?;
        w.set_focus()?;
        return Ok(None);
    }
    let area = work_area(app);
    let saved = note.window.map(|r| Rect {
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
    });
    let content = match saved {
        Some(r) if intersects(&r, &area) => r,
        _ => {
            let cascade = app.state::<AppState>().cascade.fetch_add(1, Ordering::SeqCst);
            let tab = window_rect(app, TAB).unwrap_or_else(|| tab_rect(&area, 0.36, 1));
            default_note_rect(&area, &tab, cascade, DEFAULT_NOTE_W, DEFAULT_NOTE_H)
        }
    };
    let r = note_window_rect(&content);
    let m = 2.0 * NOTE_MARGIN;
    WebviewWindowBuilder::new(app, &label, WebviewUrl::App("note.html".into()))
        .title("Cute Sticky")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(note.pinned)
        .skip_taskbar(true)
        .resizable(true)
        .min_inner_size(200.0 + m, 150.0 + m)
        .max_inner_size(520.0 + m, 600.0 + m)
        .position(r.x, r.y)
        .inner_size(r.w, r.h)
        .focused(true)
        .build()?;
    #[cfg(debug_assertions)]
    if std::env::var_os("CUTE_STICKY_DEVTOOLS").is_some() {
        if let Some(w) = app.get_webview_window(&label) {
            w.open_devtools();
        }
    }
    Ok(Some(content))
}

pub fn close_note_window(app: &AppHandle, id: &str) {
    if let Some(w) = app.get_webview_window(&note_label(id)) {
        let _ = w.destroy();
    }
}

pub fn set_note_on_top(app: &AppHandle, id: &str, on_top: bool) {
    if let Some(w) = app.get_webview_window(&note_label(id)) {
        let _ = w.set_always_on_top(on_top);
    }
}

/// On launch, bring back every note that was open when the app last ran.
pub fn reopen_notes(app: &AppHandle) {
    let open: Vec<Note> = {
        let state = app.state::<AppState>();
        let store = state.store.lock().unwrap();
        store.notes().iter().filter(|n| n.open).cloned().collect()
    };
    for note in open {
        match open_note_window(app, &note) {
            Ok(rect) => remember_rect(app, &note.id, rect),
            Err(err) => log::error!("could not reopen note {}: {err}", note.id),
        }
    }
}

/// Stores the content rect a freshly created note window was given.
pub fn remember_rect(app: &AppHandle, id: &str, rect: Option<Rect>) {
    let Some(r) = rect else {
        return;
    };
    let state = app.state::<AppState>();
    let mut store = state.store.lock().unwrap();
    if let Some(note) = store.note_mut(id) {
        note.window = Some(crate::store::WindowRect {
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
        });
    }
}
