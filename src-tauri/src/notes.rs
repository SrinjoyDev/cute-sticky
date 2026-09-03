//! The commands the three pages call.

use tauri::{AppHandle, Manager, State};

use crate::store::{now_ms, Data, Note, COLORS};
use crate::{emit_changed, hover, windows, AppState};

#[tauri::command]
pub fn list_notes(state: State<AppState>) -> Data {
    state.store.lock().unwrap().snapshot()
}

#[tauri::command]
pub fn get_note(state: State<AppState>, id: String) -> Option<Note> {
    state.store.lock().unwrap().note(&id).cloned()
}

#[tauri::command]
pub fn create_note(app: AppHandle, state: State<AppState>) -> Result<Note, String> {
    let note = state.store.lock().unwrap().create_note();
    hover::force_hide(&app);
    windows::open_note_window(&app, &note).map_err(|e| e.to_string())?;
    emit_changed(&app);
    Ok(note)
}

#[tauri::command]
pub fn update_note(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    content: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    if let Some(c) = &color {
        if !COLORS.contains(&c.as_str()) {
            return Err(format!("unknown colour {c}"));
        }
    }
    {
        let mut store = state.store.lock().unwrap();
        let note = store.note_mut(&id).ok_or("no such note")?;
        if let Some(content) = content {
            note.content = content;
        }
        if let Some(color) = color {
            note.color = color;
        }
        note.updated_at = now_ms();
    }
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn delete_note(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    if !state.store.lock().unwrap().delete_note(&id) {
        return Err("no such note".into());
    }
    windows::close_note_window(&app, &id);
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn open_note(app: AppHandle, state: State<AppState>, id: String) -> Result<(), String> {
    let note = {
        let mut store = state.store.lock().unwrap();
        let note = store.note_mut(&id).ok_or("no such note")?;
        note.open = true;
        note.clone()
    };
    hover::force_hide(&app);
    windows::open_note_window(&app, &note).map_err(|e| e.to_string())?;
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn close_note(app: AppHandle, id: String) -> Result<(), String> {
    mark_closed(&app, &id);
    windows::close_note_window(&app, &id);
    Ok(())
}

/// Records that a note's window is gone. Safe to call more than once.
pub fn mark_closed(app: &AppHandle, id: &str) {
    let changed = {
        let state = app.state::<AppState>();
        let mut store = state.store.lock().unwrap();
        match store.note_mut(id) {
            Some(note) if note.open => {
                note.open = false;
                true
            }
            _ => false,
        }
    };
    if changed {
        emit_changed(app);
    }
}

#[tauri::command]
pub fn set_note_pinned(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    pinned: bool,
) -> Result<(), String> {
    {
        let mut store = state.store.lock().unwrap();
        store.note_mut(&id).ok_or("no such note")?.pinned = pinned;
    }
    windows::set_note_on_top(&app, &id, pinned);
    emit_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn hover(app: AppHandle, source: String, inside: bool) {
    hover::hover(&app, &source, inside);
}

#[tauri::command]
pub fn pile_hidden(app: AppHandle) {
    hover::pile_hidden(&app);
}

#[tauri::command]
pub fn tab_drag(app: AppHandle, top: f64, done: bool) {
    windows::tab_drag(&app, top, done);
}
