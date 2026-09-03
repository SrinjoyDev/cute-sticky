//! Persistent state: notes and settings in one JSON file, written atomically.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const COLORS: [&str; 6] = ["butter", "peach", "mint", "sky", "lilac", "rose"];
pub const DEFAULT_NOTE_W: f64 = 270.0;
pub const DEFAULT_NOTE_H: f64 = 230.0;

/// Content rectangle of a note window in logical pixels (shadow margin excluded).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct WindowRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub color: String,
    pub content: String,
    pub pinned: bool,
    pub open: bool,
    pub window: Option<WindowRect>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Vertical centre of the tab as a fraction of the work-area height.
    pub tab_y: f64,
    pub tab_hidden: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { tab_y: 0.36, tab_hidden: false }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Data {
    pub version: u32,
    pub settings: Settings,
    pub notes: Vec<Note>,
}

impl Default for Data {
    fn default() -> Self {
        Data { version: 1, settings: Settings::default(), notes: Vec::new() }
    }
}

pub struct Store {
    path: PathBuf,
    data: Data,
    dirty: bool,
}

impl Store {
    /// Reads the file if it exists. Unreadable JSON is moved aside, never overwritten.
    pub fn load(path: PathBuf) -> Store {
        let data = match fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<Data>(&text) {
                Ok(data) => data,
                Err(err) => {
                    log::error!("{} is not valid; moving it aside: {err}", path.display());
                    quarantine(&path);
                    Data::default()
                }
            },
            Err(err) if err.kind() == io::ErrorKind::NotFound => Data::default(),
            Err(err) => {
                log::error!("could not read {}: {err}", path.display());
                Data::default()
            }
        };
        Store { path, data, dirty: false }
    }

    pub fn data(&self) -> &Data {
        &self.data
    }

    pub fn snapshot(&self) -> Data {
        self.data.clone()
    }

    pub fn notes(&self) -> &[Note] {
        &self.data.notes
    }

    pub fn note(&self, id: &str) -> Option<&Note> {
        self.data.notes.iter().find(|n| n.id == id)
    }

    pub fn note_mut(&mut self, id: &str) -> Option<&mut Note> {
        self.dirty = true;
        self.data.notes.iter_mut().find(|n| n.id == id)
    }

    pub fn settings_mut(&mut self) -> &mut Settings {
        self.dirty = true;
        &mut self.data.settings
    }

    pub fn create_note(&mut self) -> Note {
        let now = now_ms();
        let note = Note {
            id: new_id(),
            color: next_color(&self.data.notes).to_string(),
            content: String::new(),
            pinned: true,
            open: true,
            window: None,
            created_at: now,
            updated_at: now,
        };
        self.data.notes.push(note.clone());
        self.dirty = true;
        note
    }

    pub fn delete_note(&mut self, id: &str) -> bool {
        let before = self.data.notes.len();
        self.data.notes.retain(|n| n.id != id);
        let removed = self.data.notes.len() != before;
        if removed {
            self.dirty = true;
        }
        removed
    }

    pub fn is_dirty(&self) -> bool {
        self.dirty
    }

    /// Writes to a temp file, then renames over the real one.
    pub fn save(&mut self) -> io::Result<()> {
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir)?;
        }
        let json = serde_json::to_string_pretty(&self.data).map_err(io::Error::other)?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &self.path)?;
        self.dirty = false;
        Ok(())
    }

    pub fn save_if_dirty(&mut self) -> io::Result<()> {
        if self.dirty {
            self.save()
        } else {
            Ok(())
        }
    }
}

/// The colour after the last note's colour, so new notes walk the palette.
pub fn next_color(notes: &[Note]) -> &'static str {
    let last = notes.last().and_then(|n| COLORS.iter().position(|c| *c == n.color));
    match last {
        Some(i) => COLORS[(i + 1) % COLORS.len()],
        None => COLORS[0],
    }
}

fn quarantine(path: &Path) {
    let bad = path.with_extension(format!("json.bad-{}", now_ms()));
    if let Err(err) = fs::rename(path, &bad) {
        log::error!("could not move {} aside: {err}", path.display());
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn new_id() -> String {
    use rand::Rng;
    const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..10).map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn temp_path() -> PathBuf {
        static N: AtomicUsize = AtomicUsize::new(0);
        let n = N.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("cute-sticky-test-{}-{}", std::process::id(), n));
        fs::create_dir_all(&dir).unwrap();
        dir.join("notes.json")
    }

    #[test]
    fn missing_file_starts_empty() {
        let store = Store::load(temp_path());
        assert_eq!(store.data(), &Data::default());
        assert!(!store.is_dirty());
    }

    #[test]
    fn round_trip_saves_and_loads() {
        let path = temp_path();
        let mut store = Store::load(path.clone());
        let note = store.create_note();
        store.note_mut(&note.id).unwrap().content = "Groceries\n- [ ] eggs".into();
        store.settings_mut().tab_y = 0.5;
        store.save().unwrap();
        let again = Store::load(path);
        assert_eq!(again.data(), store.data());
        assert_eq!(again.note(&note.id).unwrap().content, "Groceries\n- [ ] eggs");
        assert_eq!(again.data().settings.tab_y, 0.5);
    }

    #[test]
    fn save_leaves_no_temp_file() {
        let path = temp_path();
        let mut store = Store::load(path.clone());
        store.create_note();
        store.save().unwrap();
        assert!(path.exists());
        assert!(!path.with_extension("json.tmp").exists());
        assert!(!store.is_dirty());
    }

    #[test]
    fn corrupt_file_is_quarantined() {
        let path = temp_path();
        fs::write(&path, "{ not json").unwrap();
        let store = Store::load(path.clone());
        assert_eq!(store.data(), &Data::default());
        assert!(!path.exists());
        let quarantined = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().starts_with("notes.json.bad-"));
        assert!(quarantined);
    }

    #[test]
    fn new_notes_cycle_colours() {
        let mut store = Store::load(temp_path());
        let colours: Vec<String> = (0..7).map(|_| store.create_note().color).collect();
        assert_eq!(colours[0], "butter");
        assert_eq!(colours[5], "rose");
        assert_eq!(colours[6], "butter");
    }

    #[test]
    fn next_colour_follows_the_last_note() {
        let mut store = Store::load(temp_path());
        store.create_note();
        store.create_note();
        let first = store.notes()[0].id.clone();
        store.delete_note(&first);
        assert_eq!(store.create_note().color, "mint");
    }

    #[test]
    fn delete_reports_whether_it_removed() {
        let mut store = Store::load(temp_path());
        let note = store.create_note();
        assert!(store.delete_note(&note.id));
        assert!(!store.delete_note(&note.id));
        assert!(store.notes().is_empty());
    }

    #[test]
    fn ids_are_ten_lowercase_alphanumerics() {
        let id = new_id();
        assert_eq!(id.len(), 10);
        assert!(id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
        assert_ne!(id, new_id());
    }

    #[test]
    fn json_uses_camel_case() {
        let mut store = Store::load(temp_path());
        store.create_note();
        let json = serde_json::to_string(store.data()).unwrap();
        assert!(json.contains("\"tabY\""));
        assert!(json.contains("\"createdAt\""));
        assert!(!json.contains("created_at"));
    }
}
