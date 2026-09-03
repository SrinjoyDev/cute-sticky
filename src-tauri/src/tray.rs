//! Tray icon and its menu: New note, Show/Hide tab, Start with Windows, Quit.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_autostart::ManagerExt;

use crate::{flush_now, notes, windows, AppState};

pub struct TrayHandles {
    tab_item: MenuItem<Wry>,
    autostart_item: CheckMenuItem<Wry>,
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let hidden = app.state::<AppState>().store.lock().unwrap().data().settings.tab_hidden;
    let new_item = MenuItem::with_id(app, "new", "New note", true, None::<&str>)?;
    let tab_item = MenuItem::with_id(app, "tab", tab_label(hidden), true, None::<&str>)?;
    let autostart_on = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart_item =
        CheckMenuItem::with_id(app, "autostart", "Start with Windows", true, autostart_on, None::<&str>)?;
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
                let state = app.state::<AppState>();
                if let Err(err) = notes::create_note(app.clone(), state) {
                    log::error!("new note from tray failed: {err}");
                }
            }
            "tab" => {
                let hidden = app.state::<AppState>().store.lock().unwrap().data().settings.tab_hidden;
                windows::set_tab_hidden(app, !hidden);
            }
            "autostart" => {
                let launcher = app.autolaunch();
                let on = launcher.is_enabled().unwrap_or(false);
                let result = if on { launcher.disable() } else { launcher.enable() };
                if let Err(err) = result {
                    log::error!("autostart toggle failed: {err}");
                }
                refresh(app);
            }
            "quit" => {
                flush_now(app);
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    app.state::<AppState>().tray.lock().unwrap().replace(TrayHandles { tab_item, autostart_item });
    Ok(())
}

fn tab_label(hidden: bool) -> &'static str {
    if hidden {
        "Show tab"
    } else {
        "Hide tab"
    }
}

/// Syncs the menu's label and check mark with the current state.
pub fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let hidden = state.store.lock().unwrap().data().settings.tab_hidden;
    let on = app.autolaunch().is_enabled().unwrap_or(false);
    if let Some(t) = state.tray.lock().unwrap().as_ref() {
        let _ = t.tab_item.set_text(tab_label(hidden));
        let _ = t.autostart_item.set_checked(on);
    }
}
