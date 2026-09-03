//! Cute Sticky: a tiny always-on-top sticky notes dock for Windows.
//!
//! Rust owns the data (`store`), window geometry (`geometry`, `windows`), the
//! hover state machine that shows and hides the pile (`hover`), the commands
//! the pages call (`notes`) and the tray (`tray`).

pub mod geometry;
pub mod hover;
pub mod notes;
pub mod store;
pub mod tray;
pub mod windows;

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use geometry::{note_content_rect, Rect};
use store::{Store, WindowRect};

pub struct AppState {
    pub store: Mutex<Store>,
    pub hover: Mutex<hover::HoverState>,
    pub tray: Mutex<Option<tray::TrayHandles>>,
    flush_pending: AtomicBool,
    /// How many notes were placed fresh this session; drives the cascade offset.
    pub cascade: AtomicUsize,
}

impl AppState {
    fn new(store: Store) -> Self {
        AppState {
            store: Mutex::new(store),
            hover: Mutex::new(hover::HoverState::default()),
            tray: Mutex::new(None),
            flush_pending: AtomicBool::new(false),
            cascade: AtomicUsize::new(0),
        }
    }
}

/// Saves at most once per 300 ms, coalescing bursts of edits into one write.
pub fn schedule_flush(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.flush_pending.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        let state = app.state::<AppState>();
        state.flush_pending.store(false, Ordering::SeqCst);
        let result = state.store.lock().unwrap().save_if_dirty();
        if let Err(err) = result {
            log::error!("save failed: {err}");
        }
    });
}

pub fn flush_now(app: &AppHandle) {
    let state = app.state::<AppState>();
    let result = state.store.lock().unwrap().save_if_dirty();
    if let Err(err) = result {
        log::error!("save failed: {err}");
    }
}

/// Broadcasts the current data to every window, re-fits the tab (and the pile if
/// it is showing), and schedules a save.
pub fn emit_changed(app: &AppHandle) {
    let data = app.state::<AppState>().store.lock().unwrap().snapshot();
    if let Err(err) = app.emit("notes-changed", &data) {
        log::error!("emit failed: {err}");
    }
    windows::layout_tab(app);
    if hover::is_visible(app) {
        windows::show_pile(app);
    }
    schedule_flush(app);
}

/// Makes the OS autostart entry match `settings.autostart`. Debug builds leave the
/// registry alone so a development binary never registers itself.
pub fn sync_autostart(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let want = app
        .state::<AppState>()
        .store
        .lock()
        .unwrap()
        .data()
        .settings
        .autostart;
    let launcher = app.autolaunch();
    let result = if want {
        launcher.enable()
    } else if launcher.is_enabled().unwrap_or(false) {
        launcher.disable()
    } else {
        Ok(())
    };
    if let Err(err) = result {
        log::error!("could not update start-with-Windows: {err}");
    }
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::set_tab_hidden(app, false);
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = Store::load(dir.join("notes.json"));
            app.manage(AppState::new(store));
            let handle = app.handle().clone();
            sync_autostart(&handle);
            tray::build(&handle)?;
            windows::create_tab(&handle)?;
            windows::create_pile(&handle)?;
            windows::reopen_notes(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            let Some(id) = window.label().strip_prefix("note-").map(str::to_string) else {
                return;
            };
            let app = window.app_handle().clone();
            match event {
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                    let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) else {
                        return;
                    };
                    if pos.x < -10_000 || pos.y < -10_000 || size.width == 0 {
                        return;
                    }
                    let s = window.scale_factor().unwrap_or(1.0);
                    let win = Rect {
                        x: pos.x as f64 / s,
                        y: pos.y as f64 / s,
                        w: size.width as f64 / s,
                        h: size.height as f64 / s,
                    };
                    let c = note_content_rect(&win);
                    {
                        let state = app.state::<AppState>();
                        let mut store = state.store.lock().unwrap();
                        if let Some(note) = store.note_mut(&id) {
                            note.window = Some(WindowRect {
                                x: c.x,
                                y: c.y,
                                w: c.w,
                                h: c.h,
                            });
                        }
                    }
                    schedule_flush(&app);
                }
                WindowEvent::CloseRequested { .. } => notes::mark_closed(&app, &id),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            notes::list_notes,
            notes::get_note,
            notes::create_note,
            notes::update_note,
            notes::delete_note,
            notes::open_note,
            notes::close_note,
            notes::set_note_pinned,
            notes::hover,
            notes::pile_hidden,
            notes::tab_drag,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Cute Sticky")
        .run(|app, event| match event {
            // No visible "main" window: keep running when a note window closes.
            RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
            RunEvent::ExitRequested { .. } | RunEvent::Exit => flush_now(app),
            _ => {}
        });
}
