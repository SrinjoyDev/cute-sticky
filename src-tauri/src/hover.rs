//! Decides when the pile shows and hides, from enter/leave events of the tab and pile pages.
//!
//! Entering the tab (or pile) while the pile is hidden starts a 150 ms intent timer;
//! if the cursor is still inside when it fires, the pile shows. Leaving both windows
//! starts a 250 ms grace timer; if nothing re-enters, the pile is told to fold, and
//! once its animation ends it reports back and the window is hidden. Every event
//! bumps a generation counter so stale timers do nothing. A cursor watchdog covers
//! the rare case where a leave event never arrives.

use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::{windows, AppState};

const INTENT_MS: u64 = 150;
const GRACE_MS: u64 = 250;
const WATCHDOG_MS: u64 = 400;

#[derive(Default)]
pub struct HoverState {
    pub inside_tab: bool,
    pub inside_pile: bool,
    pub visible: bool,
    pub folding: bool,
    generation: u64,
}

impl HoverState {
    fn inside_any(&self) -> bool {
        self.inside_tab || self.inside_pile
    }
}

pub fn hover(app: &AppHandle, source: &str, inside: bool) {
    let state = app.state::<AppState>();
    let mut h = state.hover.lock().unwrap();
    match source {
        "tab" => h.inside_tab = inside,
        "pile" => h.inside_pile = inside,
        _ => return,
    }
    h.generation += 1;
    let generation = h.generation;

    if inside {
        // A stale "visible" (the window was hidden behind our back) must not block a show.
        if h.visible && !h.folding && !windows::pile_is_visible(app) {
            h.visible = false;
        }
        if h.visible {
            if h.folding {
                h.folding = false;
                drop(h);
                windows::show_pile(app);
            }
            return;
        }
        drop(h);
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(INTENT_MS));
            let state = app.state::<AppState>();
            let mut h = state.hover.lock().unwrap();
            if h.generation == generation && !h.visible && h.inside_any() {
                h.visible = true;
                h.folding = false;
                drop(h);
                windows::show_pile(&app);
                watch_cursor(&app);
            }
        });
        return;
    }

    if h.visible && !h.inside_any() {
        drop(h);
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(GRACE_MS));
            let state = app.state::<AppState>();
            let mut h = state.hover.lock().unwrap();
            if h.generation == generation && h.visible && !h.folding {
                h.folding = true;
                drop(h);
                windows::fold_pile(&app);
            }
        });
    }
}

/// The pile page finished its fold animation.
pub fn pile_hidden(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut h = state.hover.lock().unwrap();
    if h.folding {
        h.folding = false;
        h.visible = false;
        drop(h);
        windows::hide_pile(app);
    }
}

/// Hide right away with no animation: a note was opened, or the tab was hidden.
pub fn force_hide(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut h = state.hover.lock().unwrap();
    h.visible = false;
    h.folding = false;
    h.inside_pile = false;
    h.generation += 1;
    drop(h);
    windows::hide_pile(app);
}

/// Whether the pile is currently shown (or folding).
pub fn is_visible(app: &AppHandle) -> bool {
    app.state::<AppState>().hover.lock().unwrap().visible
}

/// Safety net: while the pile is visible, if the cursor is over neither window
/// but a page still claims it is inside, treat that as a leave.
fn watch_cursor(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(WATCHDOG_MS));
        let claims_inside = {
            let state = app.state::<AppState>();
            let h = state.hover.lock().unwrap();
            if !h.visible {
                return;
            }
            h.inside_any()
        };
        if claims_inside && !windows::cursor_over_dock(&app) {
            hover(&app, "tab", false);
            hover(&app, "pile", false);
        }
    });
}
