use std::{collections::HashMap, sync::LazyLock};

use axum::extract::ws::Message;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RageConfig {
    pub slots: usize,
    pub ring_r: f32,
    pub ring_angle0: f32,
    pub near_dist: f32,
    pub items: Vec<String>,
    pub default_labels: Vec<u8>,
    pub nicknames: Vec<serde_json::Value>,
}

pub static RAGE: LazyLock<RageConfig> = LazyLock::new(|| {
    let c: RageConfig =
        serde_json::from_str(include_str!("rage-room.json")).expect("rage-room.json không hợp lệ");
    assert_eq!(
        c.default_labels.len(),
        c.slots,
        "defaultLabels phải đủ số hình nộm"
    );
    assert!(
        c.default_labels
            .iter()
            .all(|&n| (n as usize) < c.nicknames.len()),
        "defaultLabels trỏ ra ngoài danh sách biệt danh"
    );
    c
});

pub const MISS: u8 = 255;
const NEAR_SLACK_M: f32 = 4.0;

pub fn slot_pos(k: usize) -> (f32, f32) {
    let a = RAGE.ring_angle0 + k as f32 * std::f32::consts::TAU / RAGE.slots as f32;
    (a.sin() * RAGE.ring_r, a.cos() * RAGE.ring_r)
}

pub fn near_booth(x: f32, z: f32) -> bool {
    (0..RAGE.slots).any(|k| {
        let (sx, sz) = slot_pos(k);
        (x - sx).hypot(z - sz) <= RAGE.near_dist + NEAR_SLACK_M
    })
}
const THROW_GAP_MS: u64 = 300;
const THROWS_PER_SEC: u32 = 60;
const COUNT_EVERY_MS: u64 = 3000;
const LABEL_GAP_MS: u64 = 1500;

#[derive(Default)]
struct PerPlayer {
    last_throw_ms: Option<u64>,
    last_label_ms: Option<u64>,
}

pub struct RageRoom {
    labels: Vec<u8>,
    today: u64,
    count_dirty: bool,
    last_count_ms: u64,
    day: Option<u32>,
    window_start: u64,
    in_window: u32,
    players: HashMap<u16, PerPlayer>,
    labels_dirty: bool,
}

impl Default for RageRoom {
    fn default() -> Self {
        Self {
            labels: RAGE.default_labels.clone(),
            today: 0,
            count_dirty: false,
            last_count_ms: 0,
            day: None,
            window_start: 0,
            in_window: 0,
            players: HashMap::new(),
            labels_dirty: false,
        }
    }
}

impl RageRoom {
    pub fn state_msg(&self) -> Message {
        Message::Text(
            json!({ "t": "rage", "labels": self.labels, "today": self.today })
                .to_string()
                .into(),
        )
    }

    pub fn set_day(&mut self, day: u32) {
        if self.day.is_some_and(|d| d != day) {
            self.today = 0;
            self.count_dirty = true;
        }
        self.day = Some(day);
    }

    pub fn forget(&mut self, index: u16) {
        self.players.remove(&index);
    }

    pub fn on_throw(&mut self, index: u16, slot: u8, item: u8, u: f32, v: f32, now: u64) {
        if (item as usize) >= RAGE.items.len()
            || ((slot as usize) >= RAGE.slots && slot != MISS)
            || !u.is_finite()
            || !v.is_finite()
        {
            return;
        }
        let p = self.players.entry(index).or_default();
        if p.last_throw_ms
            .is_some_and(|t| now.saturating_sub(t) < THROW_GAP_MS)
        {
            return;
        }
        if now.saturating_sub(self.window_start) >= 1000 {
            self.window_start = now;
            self.in_window = 0;
        }
        if self.in_window >= THROWS_PER_SEC {
            return;
        }
        self.in_window += 1;
        p.last_throw_ms = Some(now);
        self.today += 1;
        self.count_dirty = true;
    }

    pub fn on_label(&mut self, index: u16, slot: u8, nick: u8, now: u64) {
        if (slot as usize) >= RAGE.slots || (nick as usize) >= RAGE.nicknames.len() {
            return;
        }
        let p = self.players.entry(index).or_default();
        if p.last_label_ms
            .is_some_and(|t| now.saturating_sub(t) < LABEL_GAP_MS)
        {
            return;
        }
        p.last_label_ms = Some(now);
        if self.labels[slot as usize] != nick {
            self.labels[slot as usize] = nick;
            self.labels_dirty = true;
        }
    }

    pub fn flush(&mut self, now: u64) -> Option<Message> {
        let count_due =
            self.count_dirty && now.saturating_sub(self.last_count_ms) >= COUNT_EVERY_MS;
        if !self.labels_dirty && !count_due {
            return None;
        }
        self.labels_dirty = false;
        self.count_dirty = false;
        self.last_count_ms = now;
        Some(self.state_msg())
    }
}
