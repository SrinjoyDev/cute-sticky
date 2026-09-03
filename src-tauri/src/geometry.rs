//! Pure layout math for every window. Units are logical pixels.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub fn right(&self) -> f64 {
        self.x + self.w
    }
    pub fn bottom(&self) -> f64 {
        self.y + self.h
    }
    pub fn center_y(&self) -> f64 {
        self.y + self.h / 2.0
    }
}

pub const TAB_W: f64 = 22.0;
pub const TAB_SHADOW: f64 = 8.0;
pub const TAB_WINDOW_W: f64 = TAB_W + TAB_SHADOW;
pub const MAX_DOTS: usize = 8;
const TAB_MIN_H: f64 = 26.0;
const DOT_STEP: f64 = 13.0;
const MORE_LABEL_H: f64 = 12.0;

pub const CARD_W: f64 = 170.0;
pub const CARD_H: f64 = 110.0;
pub const PEEK: f64 = 18.0;
pub const GHOST_H: f64 = 34.0;
pub const GHOST_GAP: f64 = 6.0;
pub const STEP_MIN: f64 = 22.0;
pub const STEP_MAX: f64 = 38.0;
pub const PILE_GAP: f64 = 8.0;
pub const PILE_PAD: f64 = 4.0;

pub const NOTE_MARGIN: f64 = 16.0;
const CASCADE: f64 = 26.0;

/// Height of the tab window for a given note count: 8 px dots with 5 px gaps
/// inside 8 px padding, capped at eight dots plus a `+n` label.
pub fn tab_height(note_count: usize) -> f64 {
    let dots = note_count.clamp(1, MAX_DOTS) as f64;
    let mut h = 11.0 + DOT_STEP * dots;
    if note_count > MAX_DOTS {
        h += MORE_LABEL_H;
    }
    h.max(TAB_MIN_H)
}

/// Tab window rect: flush with the right edge, centred at `tab_y` of the work area.
pub fn tab_rect(area: &Rect, tab_y: f64, note_count: usize) -> Rect {
    let h = tab_height(note_count);
    let lo = area.y + h / 2.0 + 4.0;
    let hi = (area.bottom() - h / 2.0 - 4.0).max(lo);
    let center = (area.y + tab_y * area.h).clamp(lo, hi);
    Rect {
        x: area.right() - TAB_WINDOW_W,
        y: center - h / 2.0,
        w: TAB_WINDOW_W,
        h,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PileLayout {
    pub step: f64,
    pub visible_h: f64,
    pub total_h: f64,
    pub push: f64,
    pub width: f64,
}

/// Card spacing and window height for the pile. The step shrinks when many
/// notes would otherwise overflow the screen.
pub fn pile_layout(note_count: usize, area_h: f64) -> PileLayout {
    let n = note_count as f64;
    let step = if note_count < 2 {
        STEP_MAX
    } else {
        ((area_h - 200.0 - CARD_H - GHOST_H) / (n - 1.0)).clamp(STEP_MIN, STEP_MAX)
    };
    let push = CARD_H - step + GHOST_GAP;
    let ghost_top = if note_count == 0 {
        0.0
    } else {
        (n - 1.0) * step + CARD_H + GHOST_GAP
    };
    let visible_h = ghost_top + GHOST_H;
    let total_h = if note_count == 0 {
        visible_h
    } else {
        visible_h + push
    };
    PileLayout {
        step,
        visible_h,
        total_h,
        push,
        width: CARD_W + PEEK + PILE_PAD,
    }
}

/// Pile window rect: left of the tab, centred on it, kept inside the work area.
pub fn pile_rect(area: &Rect, tab: &Rect, layout: &PileLayout) -> Rect {
    let x = tab.x + TAB_SHADOW - PILE_GAP - layout.width;
    let lo = area.y + 4.0;
    let hi = (area.bottom() - layout.total_h - 4.0).max(lo);
    let y = (tab.center_y() - layout.visible_h / 2.0).clamp(lo, hi);
    Rect {
        x,
        y,
        w: layout.width,
        h: layout.total_h,
    }
}

/// Content rect for a note opened for the first time: left of the tab, cascading.
pub fn default_note_rect(area: &Rect, tab: &Rect, cascade: usize, w: f64, h: f64) -> Rect {
    let k = (cascade % 6) as f64;
    let x = tab.x + TAB_SHADOW - 48.0 - w - k * CASCADE;
    let y = tab.center_y() - 70.0 + k * CASCADE;
    clamp_into(Rect { x, y, w, h }, area, 12.0)
}

pub fn clamp_into(r: Rect, area: &Rect, margin: f64) -> Rect {
    let x = r.x.clamp(
        area.x + margin,
        (area.right() - r.w - margin).max(area.x + margin),
    );
    let y = r.y.clamp(
        area.y + margin,
        (area.bottom() - r.h - margin).max(area.y + margin),
    );
    Rect { x, y, ..r }
}

pub fn intersects(a: &Rect, b: &Rect) -> bool {
    a.x < b.right() && b.x < a.right() && a.y < b.bottom() && b.y < a.bottom()
}

/// Window rect for a note: the content rect plus the transparent shadow margin.
pub fn note_window_rect(content: &Rect) -> Rect {
    Rect {
        x: content.x - NOTE_MARGIN,
        y: content.y - NOTE_MARGIN,
        w: content.w + 2.0 * NOTE_MARGIN,
        h: content.h + 2.0 * NOTE_MARGIN,
    }
}

pub fn note_content_rect(window: &Rect) -> Rect {
    Rect {
        x: window.x + NOTE_MARGIN,
        y: window.y + NOTE_MARGIN,
        w: window.w - 2.0 * NOTE_MARGIN,
        h: window.h - 2.0 * NOTE_MARGIN,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn area() -> Rect {
        Rect {
            x: 0.0,
            y: 0.0,
            w: 1920.0,
            h: 1032.0,
        }
    }

    #[test]
    fn tab_height_grows_per_dot_and_caps_at_eight() {
        assert_eq!(tab_height(0), 26.0);
        assert_eq!(tab_height(1), 26.0);
        assert_eq!(tab_height(4), 63.0);
        assert_eq!(tab_height(8), 115.0);
        assert_eq!(tab_height(9), 127.0);
        assert_eq!(tab_height(40), 127.0);
    }

    #[test]
    fn tab_is_flush_with_the_right_edge_and_centred() {
        let r = tab_rect(&area(), 0.5, 4);
        assert_eq!(r.right(), 1920.0);
        assert_eq!(r.w, TAB_WINDOW_W);
        assert_eq!(r.center_y(), 516.0);
    }

    #[test]
    fn tab_stays_inside_the_work_area() {
        let top = tab_rect(&area(), 0.0, 4);
        assert!(top.y >= 0.0);
        let bottom = tab_rect(&area(), 1.0, 4);
        assert!(bottom.bottom() <= 1032.0);
    }

    #[test]
    fn pile_step_shrinks_with_many_notes_but_never_below_minimum() {
        assert_eq!(pile_layout(1, 1032.0).step, 38.0);
        assert_eq!(pile_layout(4, 1032.0).step, 38.0);
        let many = pile_layout(40, 1032.0);
        assert_eq!(many.step, 22.0);
        assert!(many.total_h > many.visible_h);
    }

    #[test]
    fn pile_heights_account_for_ghost_and_push_room() {
        let l = pile_layout(4, 1032.0);
        assert_eq!(l.visible_h, 3.0 * 38.0 + 110.0 + 6.0 + 34.0);
        assert_eq!(l.push, 110.0 - 38.0 + 6.0);
        assert_eq!(l.total_h, l.visible_h + l.push);
        assert_eq!(l.width, CARD_W + PEEK + PILE_PAD);
        let empty = pile_layout(0, 1032.0);
        assert_eq!(empty.visible_h, 34.0);
        assert_eq!(empty.total_h, 34.0);
    }

    #[test]
    fn pile_sits_left_of_the_tab_and_inside_the_area() {
        let tab = tab_rect(&area(), 0.95, 4);
        let layout = pile_layout(4, 1032.0);
        let p = pile_rect(&area(), &tab, &layout);
        assert_eq!(p.right(), tab.x + TAB_SHADOW - PILE_GAP);
        assert!(p.bottom() <= 1032.0);
        assert!(p.y >= 0.0);
    }

    #[test]
    fn default_note_cascades_and_stays_inside() {
        let tab = tab_rect(&area(), 0.36, 4);
        let a = default_note_rect(&area(), &tab, 0, 270.0, 230.0);
        let b = default_note_rect(&area(), &tab, 1, 270.0, 230.0);
        assert!(a.right() < tab.x);
        assert_eq!(b.x, a.x - 26.0);
        assert_eq!(b.y, a.y + 26.0);
        let small = Rect {
            x: 0.0,
            y: 0.0,
            w: 300.0,
            h: 200.0,
        };
        let squeezed = default_note_rect(&small, &tab, 0, 270.0, 230.0);
        assert!(squeezed.x >= 12.0);
    }

    #[test]
    fn window_and_content_rects_round_trip() {
        let content = Rect {
            x: 100.0,
            y: 200.0,
            w: 270.0,
            h: 230.0,
        };
        let win = note_window_rect(&content);
        assert_eq!(win.w, 270.0 + 2.0 * NOTE_MARGIN);
        assert_eq!(note_content_rect(&win), content);
    }

    #[test]
    fn intersects_detects_overlap() {
        let a = Rect {
            x: 0.0,
            y: 0.0,
            w: 10.0,
            h: 10.0,
        };
        assert!(intersects(
            &a,
            &Rect {
                x: 5.0,
                y: 5.0,
                w: 10.0,
                h: 10.0
            }
        ));
        assert!(!intersects(
            &a,
            &Rect {
                x: 10.0,
                y: 0.0,
                w: 10.0,
                h: 10.0
            }
        ));
    }
}
