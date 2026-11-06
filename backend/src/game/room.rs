use std::{
    collections::{HashMap, VecDeque},
    hash::{DefaultHasher, Hash, Hasher},
    sync::{Arc, LazyLock},
};

use axum::extract::ws::Message;
use serde_json::json;
use uuid::Uuid;

use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

use super::bot_chat::BotChat;
use super::bots::{self, Bot, Rng};
use super::chat_filter::ChatFilter;
use super::constants::GAME;
use super::protocol::{
    MovePayload, MoveRecord, dq_pos, encode_correction, encode_moves, encode_welcome, q_pos,
};
use super::rage::RageRoom;

mod talk;
pub use talk::TalkConfig;
use talk::Talks;

pub type SessionId = Uuid;

pub const NAME_MAX_CHARS: usize = 30;
const QUEUE_NOTIFY_MS: u64 = 3000;
const TAKEOVER_MAX: u8 = 3;
const TAKEOVER_WINDOW_MS: u64 = 60_000;
const SLOW_KICKS_MAX: u8 = 2;
const SLOW_KICK_WINDOW_MS: u64 = 60_000;
const BUDGET_SPEED_FACTOR: f32 = 1.5;
const BUDGET_MAX_S: f32 = 3.0;
const MOVE_SLACK_M: f32 = 1.0;
const CORRECTION_GRACE_MS: u64 = 1_000;
const CORRECTION_EPS_M: f32 = 0.05;

fn budget_max() -> f32 {
    GAME.move_speed * BUDGET_SPEED_FACTOR * BUDGET_MAX_S
}

fn clamp_walkable(x: f32, z: f32) -> (f32, f32) {
    let r = x.hypot(z);
    let min_r = GAME.fire_radius + GAME.player_radius;
    let target = if r > GAME.walk_radius {
        GAME.walk_radius
    } else if r < min_r {
        min_r
    } else {
        return (x, z);
    };
    if r < 1e-4 {
        return (0.0, target);
    }
    (x * target / r, z * target / r)
}
const CHAT_DUP_MS: u64 = 10_000;
const CHAT_INTERVAL_SLACK_MS: u64 = 300;
pub const BOARD_VIDEO_IDS: &[&str] = &["GhYTscKPvxo", "6aggZ1cQsvo"];

pub const POLL_ENABLED: bool = false;
pub const POLL_ID: u32 = 1;
pub const POLL_QUESTION: &str = "Hôm nay MU sẽ thắng, hoà hay thua?";
pub const POLL_OPTIONS: [&str; 3] = ["MU thắng 💪", "Hoà 🤝", "MU thua 😢"];

pub fn poll_msg() -> Message {
    Message::Text(
        json!({ "t": "poll", "id": POLL_ID, "q": POLL_QUESTION, "options": POLL_OPTIONS })
            .to_string()
            .into(),
    )
}

static POLL_FRAME: LazyLock<Message> = LazyLock::new(poll_msg);

pub fn vote_text(option: &str) -> String {
    format!("🗳️ Bình chọn: {option}")
}

const NOTICE_GAP_MS: u64 = 5_000;
const NOTICE_NAMES_SHOWN: usize = 2;
const NOTICE_NAME_MAX_CHARS: usize = 20;

fn notice_name(raw: &str, filter: &ChatFilter) -> String {
    let cleaned: String = clean_text(raw)
        .chars()
        .take(NOTICE_NAME_MAX_CHARS)
        .collect();
    let name = filter.clean(cleaned.trim());
    if name.trim().is_empty() {
        "Một anh em".into()
    } else {
        name
    }
}

#[derive(Debug, Default)]
struct NoticeBatch {
    names: Vec<String>,
    count: u32,
    last_sent_ms: Option<u64>,
}

impl NoticeBatch {
    fn add(&mut self, name: String) {
        self.count = self.count.saturating_add(1);
        if self.names.len() < NOTICE_NAMES_SHOWN {
            self.names.push(name);
        }
    }

    fn flush(&mut self, kind: &str, now: u64) -> Option<Message> {
        if self.count == 0
            || self
                .last_sent_ms
                .is_some_and(|t| now.saturating_sub(t) < NOTICE_GAP_MS)
        {
            return None;
        }
        let more = self.count as usize - self.names.len();
        let msg = json!({ "t": "notice", "kind": kind, "names": self.names, "more": more });
        self.names.clear();
        self.count = 0;
        self.last_sent_ms = Some(now);
        Some(Message::Text(msg.to_string().into()))
    }
}

const PUNCH_MAX_PER_SEC: u32 = 20;
const PUNCH_LAG_MS: u64 = 400;
const EXTRAPOLATE_MAX_MS: u64 = 1200;

fn dir_velocity(dir: u8) -> (f32, f32) {
    let mag = (dir >> 5) as f32;
    if mag == 0.0 {
        return (0.0, 0.0);
    }
    let a = (dir & 31) as f32 / GAME.dir_steps as f32 * std::f32::consts::TAU;
    let v = mag / GAME.dir_mag_steps as f32 * GAME.move_speed;
    (a.sin() * v, a.cos() * v)
}

fn seg_dist(p: (f32, f32), a: (f32, f32), b: (f32, f32)) -> f32 {
    let (dx, dz) = (b.0 - a.0, b.1 - a.1);
    let len2 = dx * dx + dz * dz;
    let t = if len2 > 1e-6 {
        (((p.0 - a.0) * dx + (p.1 - a.1) * dz) / len2).clamp(0.0, 1.0)
    } else {
        0.0
    };
    (p.0 - a.0 - dx * t).hypot(p.1 - a.1 - dz * t)
}

pub fn punch_text(victim: &str) -> String {
    format!("đã 👊 {victim}")
}

impl Player {
    fn pos_at(&self, t: u64) -> (f32, f32) {
        let dt = t.saturating_sub(self.last_ms).min(EXTRAPOLATE_MAX_MS) as f32 / 1000.0;
        let (vx, vz) = dir_velocity(self.dir);
        let (x, z) = (self.x + vx * dt, self.z + vz * dt);
        let r = x.hypot(z);
        if r > GAME.walk_radius {
            let k = GAME.walk_radius / r;
            (x * k, z * k)
        } else {
            (x, z)
        }
    }
}

pub fn board_msg(videos: &[&str]) -> Message {
    let first = videos.first().copied().unwrap_or_default();
    Message::Text(
        json!({ "t": "board", "videos": videos, "video": first })
            .to_string()
            .into(),
    )
}

static BOARD_FRAME: LazyLock<Message> = LazyLock::new(|| board_msg(BOARD_VIDEO_IDS));

#[derive(Debug, Clone)]
pub struct RoomConfig {
    pub capacity: usize,
    pub queue_max: usize,
    pub admit_per_sec: u32,
    pub tick_hz: u32,
    pub chat_flush_ms: u64,
    pub chat_max_per_sec: u32,
    pub chat_filter: Arc<ChatFilter>,
    pub bots: usize,
    pub bot_seed: u64,
    pub talk: TalkConfig,
    pub reconnect_hold_ms: u64,
}

#[derive(Debug)]
pub enum Outbound {
    Direct(SessionId, Message),
    Broadcast(Message),
    Admit {
        session: SessionId,
        frames: Vec<Message>,
    },
    Close(SessionId, Message),
}

#[derive(Debug)]
struct Player {
    name: String,
    number: Option<u8>,
    x: f32,
    z: f32,
    heading: u8,
    dir: u8,
    last_ms: u64,
    tick_offset: Option<u16>,
    move_budget: f32,
    last_correction_ms: Option<u64>,
    last_chat_ms: Option<u64>,
    last_chat_hash: u64,
    voted: bool,
    session: Option<SessionId>,
    last_punch_ms: Option<u64>,
    immune_until: u64,
    uid: Option<Uuid>,
    away_until: Option<u64>,
    slow_kicks: (u64, u8),
    takeovers: (u64, u8),
    tab: u64,
}

impl Player {
    fn new(name: String, number: Option<u8>, x: f32, z: f32, heading: u8, now: u64) -> Self {
        Self {
            name,
            number,
            x,
            z,
            heading,
            dir: 0,
            last_ms: now,
            tick_offset: None,
            move_budget: budget_max(),
            last_correction_ms: None,
            last_chat_ms: None,
            last_chat_hash: 0,
            voted: false,
            session: None,
            last_punch_ms: None,
            immune_until: 0,
            uid: None,
            away_until: None,
            slow_kicks: (0, 0),
            takeovers: (0, 0),
            tab: 0,
        }
    }
}

fn count_in_window(c: &mut (u64, u8), now: u64, window: u64, max: u8) -> bool {
    if now.saturating_sub(c.0) >= window {
        *c = (now, 0);
    }
    if c.1 >= max {
        return false;
    }
    c.1 += 1;
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Place {
    Room(u16),
    Queue,
    Resuming(u16),
}

#[derive(Debug)]
struct Session {
    name: String,
    number: Option<u8>,
    place: Place,
    uid: Option<Uuid>,
    tab: u64,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct SessionStats {
    pub away: usize,
    pub resumed: u32,
    pub expired: u32,
    pub replaced: u32,
}

pub struct RoomCore {
    cfg: RoomConfig,
    slots: Vec<Option<Player>>,
    free: Vec<u16>,
    sessions: HashMap<SessionId, Session>,
    queue: VecDeque<SessionId>,
    in_room: usize,
    pending: Vec<MoveRecord>,
    pending_slot: Vec<i32>,
    admit_window_start: u64,
    admits_in_window: u32,
    queue_dirty: bool,
    last_queue_notify: u64,
    pending_chat: Vec<PendingChat>,
    last_chat_flush: u64,
    chat_window_start: u64,
    chats_in_window: u32,
    punch_window_start: u64,
    punches_in_window: u32,
    corrections: u32,
    tele_batch: NoticeBatch,
    rage: RageRoom,
    join_batch: NoticeBatch,
    bots: Vec<Bot>,
    rng: Rng,
    last_bot_step: u64,
    bot_evicted: bool,
    bot_refill_at: u64,
    bot_chat: BotChat,
    talks: Talks,
    by_uid: HashMap<Uuid, u16>,
    away: VecDeque<(u64, Uuid)>,
    resume_pending: VecDeque<SessionId>,
    resumes_in_tick: u32,
    stats: SessionStats,
}

const BOT_REFILL_MS: u64 = 30_000;

pub fn sanitize_number(raw: Option<i64>) -> Option<u8> {
    raw.filter(|n| (1..=99).contains(n)).map(|n| n as u8)
}

pub fn sanitize_name(raw: &str) -> Option<String> {
    let name = clean_text(raw);
    let n = name.chars().count();
    (1..=NAME_MAX_CHARS).contains(&n).then_some(name)
}

fn is_invisible(c: char) -> bool {
    c.is_control()
        || matches!(c,
            '\u{00AD}' | '\u{034F}' | '\u{115F}' | '\u{1160}' | '\u{17B4}' | '\u{17B5}'
            | '\u{180E}' | '\u{200B}'..='\u{200F}' | '\u{2028}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{2069}' | '\u{2800}' | '\u{3164}'
            | '\u{FEFF}' | '\u{FFA0}' | '\u{E0000}'..='\u{E007F}')
}

const MAX_MARKS: usize = 2;

fn clean_text(raw: &str) -> String {
    let visible: String = raw
        .chars()
        .map(|c| if c == '\n' || c == '\t' { ' ' } else { c })
        .filter(|c| !is_invisible(*c))
        .collect();
    let mut out = String::with_capacity(visible.len());
    let mut marks = 0;
    for c in visible.nfc() {
        if is_combining_mark(c) {
            marks += 1;
            if marks > MAX_MARKS {
                continue;
            }
        } else {
            marks = 0;
        }
        out.push(c);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn sanitize_chat(raw: &str) -> Option<String> {
    let text = clean_text(raw);
    let n = text.chars().count();
    (1..=GAME.chat_max_chars).contains(&n).then_some(text)
}

pub fn chat_dropped(reason: &str, id: u32) -> Message {
    Message::Text(
        json!({ "t": "chatDropped", "reason": reason, "id": id })
            .to_string()
            .into(),
    )
}

fn replaced_msg() -> Message {
    Message::Text(json!({ "t": "replaced" }).to_string().into())
}

#[derive(Debug)]
struct PendingChat {
    index: u16,
    session: SessionId,
    id: u32,
    ack: bool,
    text: String,
}

impl RoomCore {
    pub fn new(cfg: RoomConfig) -> Self {
        let cap = cfg.capacity;
        Self {
            slots: (0..cap).map(|_| None).collect(),
            free: (0..cap as u16).rev().collect(),
            sessions: HashMap::new(),
            queue: VecDeque::new(),
            in_room: 0,
            pending: Vec::new(),
            pending_slot: vec![-1; cap],
            admit_window_start: 0,
            admits_in_window: 0,
            queue_dirty: false,
            last_queue_notify: 0,
            pending_chat: Vec::new(),
            last_chat_flush: 0,
            chat_window_start: 0,
            chats_in_window: 0,
            punch_window_start: 0,
            punches_in_window: 0,
            corrections: 0,
            tele_batch: NoticeBatch::default(),
            rage: RageRoom::default(),
            join_batch: NoticeBatch::default(),
            bots: Vec::new(),
            rng: Rng::new(cfg.bot_seed),
            last_bot_step: 0,
            bot_evicted: false,
            bot_refill_at: 0,
            bot_chat: BotChat::new(),
            talks: Talks::default(),
            by_uid: HashMap::new(),
            away: VecDeque::new(),
            resume_pending: VecDeque::new(),
            resumes_in_tick: 0,
            stats: SessionStats::default(),
            cfg,
        }
    }

    pub fn take_session_stats(&mut self) -> SessionStats {
        let away = self
            .slots
            .iter()
            .flatten()
            .filter(|p| p.away_until.is_some())
            .count();
        SessionStats {
            away,
            ..std::mem::take(&mut self.stats)
        }
    }

    pub fn take_corrections(&mut self) -> u32 {
        std::mem::take(&mut self.corrections)
    }

    pub fn in_room(&self) -> usize {
        self.in_room + self.bots.len()
    }

    pub fn waiting(&self) -> usize {
        self.queue.len()
    }

    pub fn capacity(&self) -> usize {
        self.cfg.capacity
    }

    pub fn server_tick(&self, now_ms: u64) -> u16 {
        ((now_ms * self.cfg.tick_hz as u64 / 1000) % 65_536) as u16
    }

    fn queued_msg(&self, position: usize) -> Message {
        Message::Text(
            json!({ "t": "queued", "position": position, "inRoom": self.in_room(), "waiting": self.queue.len() })
                .to_string()
                .into(),
        )
    }

    fn can_admit_now(&mut self, now: u64) -> bool {
        if now.saturating_sub(self.admit_window_start) >= 1000 {
            self.admit_window_start = now;
            self.admits_in_window = 0;
        }
        self.in_room < self.cfg.capacity && self.admits_in_window < self.cfg.admit_per_sec
    }

    #[allow(clippy::too_many_arguments)]
    pub fn enter_as(
        &mut self,
        session: SessionId,
        uid: Option<Uuid>,
        tab: u64,
        raw_name: &str,
        number: Option<u8>,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        if self.sessions.contains_key(&session) {
            return;
        }
        let Some(name) = sanitize_name(raw_name) else {
            out.push(Outbound::Close(
                session,
                Message::Text(
                    json!({ "t": "rejected", "reason": "invalid_name" })
                        .to_string()
                        .into(),
                ),
            ));
            return;
        };
        if let Some(uid) = uid {
            if let Some(&index) = self.by_uid.get(&uid) {
                if self.slots[index as usize].is_some() {
                    self.resume(session, uid, tab, index, name, number, now, out);
                    return;
                }
                tracing::warn!(%uid, index, "by_uid trỏ vào slot trống — vào như lượt mới");
                self.by_uid.remove(&uid);
            }
            let sessions = &self.sessions;
            if let Some(pos) = self
                .queue
                .iter()
                .position(|q| sessions.get(q).is_some_and(|s| s.uid == Some(uid)))
            {
                let old = self.queue[pos];
                self.sessions.remove(&old);
                out.push(Outbound::Close(old, replaced_msg()));
                self.stats.replaced += 1;
                self.queue[pos] = session;
                self.sessions.insert(
                    session,
                    Session {
                        name,
                        number,
                        place: Place::Queue,
                        uid: Some(uid),
                        tab,
                    },
                );
                out.push(Outbound::Direct(session, self.queued_msg(pos + 1)));
                return;
            }
        }
        if self.queue.is_empty() && self.can_admit_now(now) {
            self.admit(session, uid, tab, name, number, now, out);
        } else if self.queue.len() < self.cfg.queue_max {
            self.queue.push_back(session);
            self.sessions.insert(
                session,
                Session {
                    name,
                    number,
                    place: Place::Queue,
                    uid,
                    tab,
                },
            );
            out.push(Outbound::Direct(session, self.queued_msg(self.queue.len())));
        } else {
            out.push(Outbound::Close(
                session,
                Message::Text(
                    json!({ "t": "rejected", "reason": "queue_full", "retryAfter": 30 })
                        .to_string()
                        .into(),
                ),
            ));
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn admit(
        &mut self,
        session: SessionId,
        uid: Option<Uuid>,
        tab: u64,
        name: String,
        number: Option<u8>,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        if self.free.is_empty() {
            self.evict_bot(now, out);
        }
        let index = self.free.pop().expect("đã kiểm tra còn chỗ");
        let a = index as f32 * 2.399_963;
        let r = 0.8 + (index % 7) as f32 * 0.35;
        let (x, z) = (GAME.spawn_x + a.sin() * r, GAME.spawn_z + a.cos() * r);
        let heading = 128u8;
        self.join_batch
            .add(notice_name(&name, &self.cfg.chat_filter));
        self.slots[index as usize] = Some(Player {
            session: Some(session),
            uid,
            tab,
            ..Player::new(name.clone(), number, x, z, heading, now)
        });
        if let Some(uid) = uid {
            self.by_uid.insert(uid, index);
        }
        self.in_room += 1;
        self.admits_in_window += 1;
        self.sessions.insert(
            session,
            Session {
                name: name.clone(),
                number,
                place: Place::Room(index),
                uid,
                tab,
            },
        );
        let frames = self.admit_frames(index, now, false);
        out.push(Outbound::Admit { session, frames });
        out.push(Outbound::Broadcast(Message::Text(
            json!({ "t": "join", "i": index, "name": name, "n": number, "x": x, "z": z })
                .to_string()
                .into(),
        )));
        if !self.bots.is_empty() {
            self.bot_chat.greet(now, &mut self.rng, &name);
        }
    }

    fn admit_frames(&self, index: u16, now: u64, resumed: bool) -> Vec<Message> {
        let mut roster = Vec::with_capacity(self.in_room());
        let mut entries = Vec::with_capacity(self.in_room());
        for (i, p) in self.slots.iter().enumerate() {
            if let Some(p) = p {
                let mut r = json!({ "i": i, "name": p.name, "n": p.number });
                if self.bots.iter().any(|b| b.index as usize == i) {
                    r["b"] = json!(true);
                }
                roster.push(r);
                entries.push((
                    i as u16,
                    MovePayload {
                        x: q_pos(p.x),
                        z: q_pos(p.z),
                        heading: p.heading,
                        dir: p.dir,
                    },
                ));
            }
        }
        let mut admitted = json!({
            "t": "admitted",
            "selfIndex": index,
            "serverTick": self.server_tick(now),
            "tickHz": self.cfg.tick_hz,
            "capacity": self.cfg.capacity,
            "roster": roster,
        });
        if resumed {
            admitted["resumed"] = json!(true);
            admitted["pollVoted"] =
                json!(self.slots[index as usize].as_ref().is_some_and(|p| p.voted));
        }
        let mut frames = vec![
            Message::Text(admitted.to_string().into()),
            Message::Binary(encode_welcome(&entries)),
            BOARD_FRAME.clone(),
        ];
        if POLL_ENABLED {
            frames.push(POLL_FRAME.clone());
        }
        frames.push(self.rage.state_msg());
        let talking = self.talks.talking_indices();
        if !talking.is_empty() {
            frames.push(talk::talking_msg(&talking, &[]));
        }
        frames
    }

    fn pull(&mut self, now: u64, out: &mut Vec<Outbound>) {
        let per_call = (self.cfg.admit_per_sec / 10).max(1);
        let mut admitted = 0;
        while admitted < per_call && !self.queue.is_empty() && self.can_admit_now(now) {
            admitted += 1;
            let session = self.queue.pop_front().expect("không rỗng");
            if let Some(s) = self.sessions.remove(&session) {
                self.admit(session, s.uid, s.tab, s.name, s.number, now, out);
            }
            self.queue_dirty = true;
        }
    }

    pub fn leave(&mut self, session: SessionId, now: u64, out: &mut Vec<Outbound>) {
        let Some(s) = self.sessions.remove(&session) else {
            return;
        };
        match s.place {
            Place::Room(index) => self.remove_player(index, now, out),
            Place::Resuming(index) => {
                self.resume_pending.retain(|q| *q != session);
                self.remove_player(index, now, out);
            }
            Place::Queue => {
                self.queue.retain(|q| *q != session);
                self.queue_dirty = true;
            }
        }
    }

    fn remove_player(&mut self, index: u16, now: u64, out: &mut Vec<Outbound>) {
        if let Some(uid) = self.slots[index as usize].as_ref().and_then(|p| p.uid) {
            self.by_uid.remove(&uid);
        }
        self.in_room -= 1;
        self.vacate(index, out);
        self.pull(now, out);
    }

    pub fn disconnect(&mut self, session: SessionId, now: u64, out: &mut Vec<Outbound>) {
        let Some(s) = self.sessions.get(&session) else {
            return;
        };
        let (index, resuming) = match s.place {
            Place::Queue => return self.leave(session, now, out),
            Place::Room(i) => (i, false),
            Place::Resuming(i) => (i, true),
        };
        if self.slots[index as usize]
            .as_ref()
            .is_none_or(|p| p.uid.is_none())
        {
            return self.leave(session, now, out);
        }
        self.sessions.remove(&session);
        if resuming {
            self.resume_pending.retain(|q| *q != session);
            let away = self.slots[index as usize].as_mut().map(|p| {
                p.session = None;
                p.away_until
            });
            match away {
                Some(None) => self.go_away(index, now, out),
                Some(Some(t)) if t <= now => {
                    self.stats.expired += 1;
                    self.remove_player(index, now, out);
                }
                _ => {}
            }
            return;
        }
        self.go_away(index, now, out);
    }

    fn go_away(&mut self, index: u16, now: u64, out: &mut Vec<Outbound>) {
        let due = now + self.cfg.reconnect_hold_ms;
        let tick = self.server_tick(now);
        let Some(p) = self.slots[index as usize].as_mut() else {
            return;
        };
        let Some(uid) = p.uid else {
            return;
        };
        let (x, z) = p.pos_at(now);
        p.x = x;
        p.z = z;
        p.dir = 0;
        p.last_ms = now;
        p.session = None;
        p.away_until = Some(due);
        let m = MovePayload {
            x: q_pos(x),
            z: q_pos(z),
            heading: p.heading,
            dir: 0,
        };
        self.away.push_back((due, uid));
        self.push_pending(MoveRecord { index, tick, m });
        self.talk_forget(index, out);
    }

    pub fn slow_kick(&mut self, session: SessionId, now: u64, out: &mut Vec<Outbound>) {
        let index = match self.sessions.get(&session).map(|s| s.place) {
            Some(Place::Room(i) | Place::Resuming(i)) => i,
            _ => return self.leave(session, now, out),
        };
        let keep = self.slots[index as usize].as_mut().is_some_and(|p| {
            count_in_window(&mut p.slow_kicks, now, SLOW_KICK_WINDOW_MS, SLOW_KICKS_MAX)
        });
        if keep {
            self.disconnect(session, now, out);
        } else {
            self.leave(session, now, out);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn resume(
        &mut self,
        session: SessionId,
        uid: Uuid,
        tab: u64,
        index: u16,
        name: String,
        number: Option<u8>,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        let tick = self.server_tick(now);
        let Some(p) = self.slots[index as usize].as_mut() else {
            return;
        };
        if let Some(old) = p.session {
            let same_tab = tab != 0 && tab == p.tab;
            if !same_tab
                && !count_in_window(&mut p.takeovers, now, TAKEOVER_WINDOW_MS, TAKEOVER_MAX)
            {
                out.push(Outbound::Close(
                    session,
                    Message::Text(
                        json!({ "t": "rejected", "reason": "other_tab" })
                            .to_string()
                            .into(),
                    ),
                ));
                return;
            }
            p.session = None;
            let (x, z) = p.pos_at(now);
            p.x = x;
            p.z = z;
            p.dir = 0;
            p.last_ms = now;
            let m = MovePayload {
                x: q_pos(x),
                z: q_pos(z),
                heading: p.heading,
                dir: 0,
            };
            if let Some(s) = self.sessions.remove(&old)
                && matches!(s.place, Place::Resuming(_))
            {
                self.resume_pending.retain(|q| *q != old);
            }
            if !same_tab {
                out.push(Outbound::Close(old, replaced_msg()));
                self.stats.replaced += 1;
            } else {
                out.push(Outbound::Close(old, Message::Close(None)));
            }
            self.push_pending(MoveRecord { index, tick, m });
            self.talk_forget(index, out);
        }
        let renamed = self.slots[index as usize]
            .as_ref()
            .is_some_and(|p| p.name != name || p.number != number);
        if renamed {
            self.talk_forget(index, out);
            if let Some(p) = self.slots[index as usize].as_mut() {
                p.name = name.clone();
                p.number = number;
                let (x, z) = (p.x, p.z);
                out.push(Outbound::Broadcast(Message::Text(
                    json!({ "t": "leave", "i": index }).to_string().into(),
                )));
                out.push(Outbound::Broadcast(Message::Text(
                    json!({ "t": "join", "i": index, "name": name, "n": number, "x": x, "z": z })
                        .to_string()
                        .into(),
                )));
            }
        }
        if let Some(p) = self.slots[index as usize].as_mut() {
            p.session = Some(session);
            p.tab = tab;
        }
        self.sessions.insert(
            session,
            Session {
                name,
                number,
                place: Place::Resuming(index),
                uid: Some(uid),
                tab,
            },
        );
        if self.resumes_in_tick < self.per_tick() {
            self.finish_resume(session, now, out);
        } else {
            self.resume_pending.push_back(session);
        }
    }

    fn per_tick(&self) -> u32 {
        (self.cfg.admit_per_sec / 10).max(1)
    }

    fn finish_resume(&mut self, session: SessionId, now: u64, out: &mut Vec<Outbound>) {
        let Some(s) = self.sessions.get_mut(&session) else {
            return;
        };
        let Place::Resuming(index) = s.place else {
            return;
        };
        let Some(p) = self.slots[index as usize].as_mut() else {
            return;
        };
        if p.session != Some(session) {
            return;
        }
        s.place = Place::Room(index);
        p.away_until = None;
        p.tick_offset = None;
        p.move_budget = budget_max();
        p.last_ms = now;
        p.last_correction_ms = None;
        self.resumes_in_tick += 1;
        self.stats.resumed += 1;
        let frames = self.admit_frames(index, now, true);
        out.push(Outbound::Admit { session, frames });
    }

    fn tick_sessions(&mut self, now: u64, out: &mut Vec<Outbound>) {
        self.resumes_in_tick = 0;
        while self.resumes_in_tick < self.per_tick() {
            let Some(session) = self.resume_pending.pop_front() else {
                break;
            };
            self.finish_resume(session, now, out);
        }
        while let Some(&(due, uid)) = self.away.front() {
            if due > now {
                break;
            }
            self.away.pop_front();
            let Some(&index) = self.by_uid.get(&uid) else {
                continue;
            };
            let expired = self.slots[index as usize]
                .as_ref()
                .is_some_and(|p| p.away_until == Some(due) && p.session.is_none());
            if expired {
                self.stats.expired += 1;
                self.remove_player(index, now, out);
            }
        }
    }

    fn push_pending(&mut self, rec: MoveRecord) {
        match self.pending_slot[rec.index as usize] {
            k if k >= 0 => self.pending[k as usize] = rec,
            _ => {
                self.pending_slot[rec.index as usize] = self.pending.len() as i32;
                self.pending.push(rec);
            }
        }
    }

    fn vacate(&mut self, index: u16, out: &mut Vec<Outbound>) {
        self.talk_forget(index, out);
        self.slots[index as usize] = None;
        self.free.push(index);
        if self.pending_slot[index as usize] >= 0 {
            self.pending.retain(|r| r.index != index);
            self.rebuild_pending_slots();
        }
        self.pending_chat.retain(|c| c.index != index);
        self.rage.forget(index);
        out.push(Outbound::Broadcast(Message::Text(
            json!({ "t": "leave", "i": index }).to_string().into(),
        )));
    }

    fn index_of(&self, session: SessionId) -> Option<u16> {
        match self.sessions.get(&session)?.place {
            Place::Room(i) => Some(i),
            Place::Queue | Place::Resuming(_) => None,
        }
    }

    pub fn on_throw(&mut self, session: SessionId, slot: u8, item: u8, u: f32, v: f32, now: u64) {
        if let Some(i) = self.index_near_booth(session) {
            self.rage.on_throw(i, slot, item, u, v, now);
        }
    }

    fn index_near_booth(&self, session: SessionId) -> Option<u16> {
        let i = self.index_of(session)?;
        let p = self.slots[i as usize].as_ref()?;
        super::rage::near_booth(p.x, p.z).then_some(i)
    }

    pub fn on_rage_label(&mut self, session: SessionId, slot: u8, nick: u8, now: u64) {
        if let Some(i) = self.index_near_booth(session) {
            self.rage.on_label(i, slot, nick, now);
        }
    }

    pub fn set_rage_day(&mut self, day: u32) {
        self.rage.set_day(day);
    }

    fn evict_bot(&mut self, now: u64, out: &mut Vec<Outbound>) {
        if let Some(b) = self.bots.pop() {
            self.vacate(b.index, out);
            self.bot_evicted = true;
            self.bot_refill_at = now + BOT_REFILL_MS;
        }
    }

    fn fill_bots(&mut self, now: u64, out: &mut Vec<Outbound>) {
        let per_call = if self.bot_evicted { 1 } else { self.cfg.bots };
        let mut added = 0;
        while added < per_call
            && self.bots.len() < self.cfg.bots
            && self.queue.is_empty()
            && now >= self.bot_refill_at
            && self.free.len() > 1
        {
            let index = self.free.pop().expect("đã kiểm tra còn slot");
            let (x, z) = bots::random_spot(&mut self.rng);
            let slots = &self.slots;
            let name = bots::random_name(&mut self.rng, |n| {
                slots.iter().flatten().any(|p| p.name == n)
            });
            let number = bots::random_number(&mut self.rng, &name);
            let bot = Bot::new(index, x, z, &mut self.rng, now);
            self.slots[index as usize] = Some(Player::new(
                name.clone(),
                number,
                x,
                z,
                bot.heading_q(),
                now,
            ));
            self.bots.push(bot);
            self.join_batch
                .add(notice_name(&name, &self.cfg.chat_filter));
            out.push(Outbound::Broadcast(Message::Text(
                json!({ "t": "join", "i": index, "name": name, "n": number, "x": x, "z": z, "b": true })
                    .to_string()
                    .into(),
            )));
            added += 1;
            if self.bot_evicted {
                self.bot_refill_at = now + self.rng.ms(5000, 15_000);
            }
        }
    }

    fn step_bots(&mut self, now: u64, out: &mut Vec<Outbound>) {
        self.fill_bots(now, out);
        if self.bots.is_empty() {
            return;
        }
        let dt = (now.saturating_sub(self.last_bot_step) as f32 / 1000.0).min(0.5);
        self.last_bot_step = now;
        let tick = self.server_tick(now);
        for k in 0..self.bots.len() {
            let b = &mut self.bots[k];
            if !b.step(now, dt, &mut self.rng) {
                continue;
            }
            let m = b.payload();
            let index = b.index;
            if let Some(p) = self.slots[index as usize].as_mut() {
                p.x = b.x;
                p.z = b.z;
                p.heading = m.heading;
                p.dir = m.dir;
                p.last_ms = now;
            }
            let rec = MoveRecord { index, tick, m };
            match self.pending_slot[index as usize] {
                k if k >= 0 => self.pending[k as usize] = rec,
                _ => {
                    self.pending_slot[index as usize] = self.pending.len() as i32;
                    self.pending.push(rec);
                }
            }
        }

        if self.in_room == 0 {
            self.bot_chat.reset();
            return;
        }
        let ids: Vec<u16> = self.bots.iter().map(|b| b.index).collect();
        let slots = &self.slots;
        self.bot_chat.plan(
            now,
            &mut self.rng,
            &ids,
            |i| {
                slots[i as usize]
                    .as_ref()
                    .map(|p| p.name.clone())
                    .unwrap_or_default()
            },
            || {
                slots
                    .iter()
                    .enumerate()
                    .filter(|(i, _)| !ids.contains(&(*i as u16)))
                    .filter_map(|(_, p)| p.as_ref().map(|p| p.name.clone()))
                    .collect()
            },
        );
        for planned in self.bot_chat.due(now) {
            let (mut text, can_vote) = (planned.text, planned.can_vote);
            let mut index = planned
                .speaker
                .filter(|i| ids.contains(i))
                .unwrap_or_else(|| ids[self.rng.below(ids.len())]);
            if POLL_ENABLED && can_vote && self.rng.f32() < 0.3 {
                let voter = self
                    .bots
                    .iter()
                    .map(|b| b.index)
                    .find(|i| self.slots[*i as usize].as_ref().is_some_and(|p| !p.voted));
                if let Some(v) = voter {
                    let option = match self.rng.f32() {
                        x if x < 0.65 => 0,
                        x if x < 0.85 => 1,
                        _ => 2,
                    };
                    if let Some(p) = self.slots[v as usize].as_mut() {
                        p.voted = true;
                    }
                    index = v;
                    text = vote_text(POLL_OPTIONS[option]);
                }
            }
            self.pending_chat.push(PendingChat {
                index,
                session: Uuid::nil(),
                id: 0,
                ack: false,
                text,
            });
        }
    }

    fn rebuild_pending_slots(&mut self) {
        self.pending_slot.iter_mut().for_each(|v| *v = -1);
        for (k, r) in self.pending.iter().enumerate() {
            self.pending_slot[r.index as usize] = k as i32;
        }
    }

    pub fn on_move(
        &mut self,
        session: SessionId,
        m: MovePayload,
        client_tick: u16,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        let Some(Session {
            place: Place::Room(index),
            ..
        }) = self.sessions.get(&session)
        else {
            return;
        };
        let index = *index;
        if self.frozen(index) && (m.dir >> 5) != 0 {
            return;
        }
        let recv_tick = self.server_tick(now);
        let Some(p) = self.slots[index as usize].as_mut() else {
            return;
        };

        let dt = now.saturating_sub(p.last_ms) as f32 / 1000.0;
        let budget = (p.move_budget + GAME.move_speed * BUDGET_SPEED_FACTOR * dt).min(budget_max());
        let (want_x, want_z) = (dq_pos(m.x), dq_pos(m.z));
        let (mut x, mut z) = clamp_walkable(want_x, want_z);
        let in_grace = p
            .last_correction_ms
            .is_some_and(|t| now.saturating_sub(t) < CORRECTION_GRACE_MS);
        let allowed = budget + MOVE_SLACK_M;
        let dist = (x - p.x).hypot(z - p.z);
        if dist > allowed && !in_grace {
            let k = allowed / dist;
            (x, z) = clamp_walkable(p.x + (x - p.x) * k, p.z + (z - p.z) * k);
            if (x - p.x).hypot(z - p.z) > allowed + CORRECTION_EPS_M {
                (x, z) = (p.x, p.z);
            }
        }
        let spent = (x - p.x).hypot(z - p.z);
        p.move_budget = if in_grace {
            budget_max()
        } else {
            (budget - spent).max(0.0)
        };
        if (x - want_x).hypot(z - want_z) > CORRECTION_EPS_M {
            self.corrections += 1;
            p.last_correction_ms = Some(now);
            out.push(Outbound::Direct(
                session,
                Message::Binary(encode_correction(q_pos(x), q_pos(z))),
            ));
        }
        let m = MovePayload {
            x: q_pos(x),
            z: q_pos(z),
            ..m
        };
        p.x = x;
        p.z = z;
        p.heading = m.heading;
        p.dir = m.dir;
        p.last_ms = now;

        let off = recv_tick.wrapping_sub(client_tick);
        let offset = match p.tick_offset {
            Some(o) if (off.wrapping_sub(o) as i16) >= 0 => o,
            _ => off,
        };
        p.tick_offset = Some(offset);
        let tick = client_tick.wrapping_add(offset);

        let rec = MoveRecord { index, tick, m };
        match self.pending_slot[index as usize] {
            k if k >= 0 => self.pending[k as usize] = rec,
            _ => {
                self.pending_slot[index as usize] = self.pending.len() as i32;
                self.pending.push(rec);
            }
        }
    }

    pub fn on_chat(
        &mut self,
        session: SessionId,
        id: u32,
        raw: &str,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        let Some(Session {
            place: Place::Room(index),
            ..
        }) = self.sessions.get(&session)
        else {
            return;
        };
        let index = *index;
        let Some(text) = sanitize_chat(raw) else {
            out.push(Outbound::Direct(session, chat_dropped("invalid", id)));
            return;
        };
        let Some(p) = self.slots[index as usize].as_mut() else {
            return;
        };
        let min_gap = GAME
            .chat_min_interval_ms
            .saturating_sub(CHAT_INTERVAL_SLACK_MS);
        if p.last_chat_ms
            .is_some_and(|t| now.saturating_sub(t) < min_gap)
        {
            out.push(Outbound::Direct(session, chat_dropped("rate", id)));
            return;
        }
        let mut h = DefaultHasher::new();
        text.to_lowercase().hash(&mut h);
        let hash = h.finish();
        if hash == p.last_chat_hash
            && p.last_chat_ms
                .is_some_and(|t| now.saturating_sub(t) < CHAT_DUP_MS)
        {
            out.push(Outbound::Direct(session, chat_dropped("duplicate", id)));
            return;
        }
        if now.saturating_sub(self.chat_window_start) >= 1000 {
            self.chat_window_start = now;
            self.chats_in_window = 0;
        }
        if self.chats_in_window >= self.cfg.chat_max_per_sec {
            out.push(Outbound::Direct(session, chat_dropped("busy", id)));
            return;
        }
        self.chats_in_window += 1;
        p.last_chat_ms = Some(now);
        p.last_chat_hash = hash;
        if !self.bots.is_empty() {
            let name = p.name.clone();
            self.bot_chat.react(now, &mut self.rng, &name, &text);
        }
        self.pending_chat.push(PendingChat {
            index,
            session,
            id,
            ack: true,
            text,
        });
    }

    pub fn on_punch(&mut self, session: SessionId, target: u16, now: u64, out: &mut Vec<Outbound>) {
        let Some(Session {
            place: Place::Room(by),
            ..
        }) = self.sessions.get(&session)
        else {
            return;
        };
        let by = *by;
        if by == target || self.talks.is_talking(by) || self.talks.is_talking(target) {
            return;
        }
        let (Some(Some(a)), Some(Some(b))) =
            (self.slots.get(by as usize), self.slots.get(target as usize))
        else {
            return;
        };
        let pa = a.pos_at(now);
        let pb = seg_dist(
            pa,
            b.pos_at(now.saturating_sub(PUNCH_LAG_MS)),
            b.pos_at(now),
        );
        let far = pb > GAME.punch_range;
        let cooling = a
            .last_punch_ms
            .is_some_and(|t| now.saturating_sub(t) < GAME.punch_cooldown_ms);
        if far || cooling || now < b.immune_until || b.away_until.is_some() {
            return;
        }
        if now.saturating_sub(self.punch_window_start) >= 1000 {
            self.punch_window_start = now;
            self.punches_in_window = 0;
        }
        if self.punches_in_window >= PUNCH_MAX_PER_SEC {
            return;
        }
        self.punches_in_window += 1;
        let text = self.cfg.chat_filter.clean(&punch_text(&b.name));
        let victim = b.session;
        if let Some(Some(a)) = self.slots.get_mut(by as usize) {
            a.last_punch_ms = Some(now);
        }
        if let Some(Some(b)) = self.slots.get_mut(target as usize) {
            b.immune_until = now + GAME.punch_immune_ms;
        }
        if let Some(v) = victim {
            out.push(Outbound::Direct(
                v,
                Message::Text(json!({ "t": "punched", "by": by }).to_string().into()),
            ));
        }
        out.push(Outbound::Direct(
            session,
            Message::Text(
                json!({ "t": "punchHit", "target": target, "text": text })
                    .to_string()
                    .into(),
            ),
        ));
        self.pending_chat.push(PendingChat {
            index: by,
            session,
            id: 0,
            ack: false,
            text,
        });
    }

    pub fn on_tele_join(&mut self, _telegram_name: &str) {
        self.tele_batch.count = self.tele_batch.count.saturating_add(1);
    }

    pub fn on_vote(&mut self, session: SessionId, poll: u32, option: u8) {
        if !POLL_ENABLED {
            return;
        }
        let Some(Session {
            place: Place::Room(index),
            ..
        }) = self.sessions.get(&session)
        else {
            return;
        };
        let index = *index;
        let Some(label) = POLL_OPTIONS.get(option as usize) else {
            return;
        };
        let Some(p) = self.slots[index as usize].as_mut() else {
            return;
        };
        if poll != POLL_ID || p.voted {
            return;
        }
        p.voted = true;
        self.pending_chat.push(PendingChat {
            index,
            session,
            id: 0,
            ack: false,
            text: vote_text(label),
        });
    }

    fn flush_chat(&mut self, now: u64, out: &mut Vec<Outbound>) {
        if self.pending_chat.is_empty()
            || now.saturating_sub(self.last_chat_flush) < self.cfg.chat_flush_ms
        {
            return;
        }
        self.last_chat_flush = now;
        let filter = &self.cfg.chat_filter;
        let mut m: Vec<serde_json::Value> = Vec::with_capacity(self.pending_chat.len());
        for c in self.pending_chat.drain(..) {
            let clean = filter.clean(&c.text);
            if c.ack {
                out.push(Outbound::Direct(
                    c.session,
                    Message::Text(
                        json!({ "t": "chatAck", "id": c.id, "text": clean })
                            .to_string()
                            .into(),
                    ),
                ));
            }
            m.push(json!([c.index, clean]));
        }
        out.push(Outbound::Broadcast(Message::Text(
            json!({ "t": "chat", "m": m }).to_string().into(),
        )));
    }

    pub fn tick(&mut self, now: u64, out: &mut Vec<Outbound>) {
        self.tick_sessions(now, out);
        self.pull(now, out);
        if self.cfg.bots > 0 {
            self.step_bots(now, out);
        }
        if !self.pending.is_empty() {
            out.push(Outbound::Broadcast(Message::Binary(encode_moves(
                self.server_tick(now),
                &self.pending,
            ))));
            for r in &self.pending {
                self.pending_slot[r.index as usize] = -1;
            }
            self.pending.clear();
        }
        self.flush_chat(now, out);
        self.talk_tick(now, out);
        if let Some(m) = self.rage.flush(now) {
            out.push(Outbound::Broadcast(m));
        }
        for (batch, kind) in [
            (&mut self.tele_batch, "tele_join"),
            (&mut self.join_batch, "room_join"),
        ] {
            if let Some(m) = batch.flush(kind, now) {
                out.push(Outbound::Broadcast(m));
            }
        }
        if self.queue_dirty && now.saturating_sub(self.last_queue_notify) >= QUEUE_NOTIFY_MS {
            for (pos, s) in self.queue.iter().enumerate() {
                out.push(Outbound::Direct(*s, self.queued_msg(pos + 1)));
            }
            self.queue_dirty = false;
            self.last_queue_notify = now;
        }
    }
}
