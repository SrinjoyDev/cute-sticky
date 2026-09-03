//! Tray icon and its menu: New note, Show/Hide tab, Start with Windows, Quit.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::{flush_now, notes, schedule_flush, sync_autostart, windows, AppState};

pub struct TrayHandles {
    tab_item: MenuItem<Wry>,
    autostart_item: CheckMenuItem<Wry>,
}

fn current_settings(app: &AppHandle) -> (bool, bool) {
    let state = app.state::<AppState>();
    let store = state.store.lock().unwrap();
    let settings = &store.data().settings;
    (settings.tab_hidden, settings.autostart)
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let (hidden, autostart_on) = current_settings(app);
    let new_item = MenuItem::with_id(app, "new", "New note", true, None::<&str>)?;
    let tab_item = MenuItem::with_id(app, "tab", tab_label(hidden), true, None::<&str>)?;
    let autostart_item = CheckMenuItem::with_id(
        app,
        "autostart",
        "Start with Windows",
        true,
        autostart_on,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&new_item, &tab_item, &autostart_item, &separator, &quit])?;

    let icon = app.default_window_icon().cloned().expect("bundle icon missing");
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Cute Sticky")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "new" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<AppState>();
                    if let Err(err) = notes::create_note(app.clone(), state).await {
                        log::error!("new note from tray failed: {err}");
                    }
                });
            }
            "tab" => {
                let (hidden, _) = current_settings(app);
                windows::set_tab_hidden(app, !hidden);
            }
            "autostart" => {
                {
                    let state = app.state::<AppState>();
                    let mut store = state.store.lock().unwrap();
                    let settings = store.settings_mut();
                    settings.autostart = !settings.autostart;
                }
                sync_autostart(app);
                refresh(app);
                schedule_flush(app);
            }
            "quit" => {
                flush_now(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    app.state::<AppState>().tray.lock().unwrap().replace(TrayHandles {
        tab_item,
        autostart_item,
    });
    Ok(())
}

fn tab_label(hidden: bool) -> &'static str {
    if hidden {
        "Show tab"
    } else {
        "Hide tab"
    }
}

/// Syncs the menu's label and check mark with the current settings.
pub fn refresh(app: &AppHandle) {
    let (hidden, on) = current_settings(app);
    let state = app.state::<AppState>();
    let tray = state.tray.lock().unwrap();
    if let Some(t) = tray.as_ref() {
        let _ = t.tab_item.set_text(tab_label(hidden));
        let _ = t.autostart_item.set_checked(on);
    }
}
