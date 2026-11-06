use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use axum::extract::ws::Message;
use serde::Serialize;
use tokio::sync::{broadcast, mpsc, watch};

use super::{
    protocol::MovePayload,
    room::{Outbound, RoomConfig, RoomCore, SessionId},
};

pub const INBOX: usize = 4096;
pub const DIRECT_QUEUE: usize = 256;
const BROADCAST_BUFFER: usize = 256;

pub enum RoomCmd {
    Enter {
        session: SessionId,
        uid: Option<uuid::Uuid>,
        tab: u64,
        name: String,
        number: Option<u8>,
        direct: mpsc::Sender<Direct>,
    },
    Leave {
        session: SessionId,
    },
    Disconnect {
        session: SessionId,
    },
    Move {
        session: SessionId,
        payload: MovePayload,
        client_tick: u16,
    },
    Chat {
        session: SessionId,
        id: u32,
        text: String,
    },
    Vote {
        session: SessionId,
        poll: u32,
        option: u8,
    },
    Punch {
        session: SessionId,
        target: u16,
    },
    Throw {
        session: SessionId,
        slot: u8,
        item: u8,
        u: f32,
        v: f32,
    },
    RageLabel {
        session: SessionId,
        slot: u8,
        nick: u8,
    },
    TalkAsk {
        session: SessionId,
        target: u16,
    },
    TalkCancel {
        session: SessionId,
    },
    TalkAnswer {
        session: SessionId,
        id: u32,
        accept: bool,
    },
    TalkEnd {
        session: SessionId,
    },
    Dm {
        session: SessionId,
        id: u32,
        text: String,
    },
    TeleJoin {
        name: String,
    },
}

pub enum Direct {
    Frame(Message),
    Subscribe(broadcast::Receiver<Message>),
    Close(Message),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RoomStatus {
    pub in_room: usize,
    pub capacity: usize,
    pub waiting: usize,
}

#[derive(Clone)]
pub struct RoomHandle {
    pub tx: mpsc::Sender<RoomCmd>,
    pub status: watch::Receiver<RoomStatus>,
    started: Instant,
    tick_hz: u32,
}

impl RoomHandle {
    pub fn server_tick(&self) -> u16 {
        ((self.started.elapsed().as_millis() as u64 * self.tick_hz as u64 / 1000) % 65_536) as u16
    }
}

pub fn spawn_room(cfg: RoomConfig, tick: Duration) -> RoomHandle {
    let (tx, rx) = mpsc::channel(INBOX);
    let initial = RoomStatus {
        in_room: 0,
        capacity: cfg.capacity,
        waiting: 0,
    };
    let (status_tx, status_rx) = watch::channel(initial);
    let started = Instant::now();
    let tick_hz = cfg.tick_hz;
    tokio::spawn(run(rx, status_tx, cfg, tick, started));
    RoomHandle {
        tx,
        status: status_rx,
        started,
        tick_hz,
    }
}

async fn run(
    mut rx: mpsc::Receiver<RoomCmd>,
    status_tx: watch::Sender<RoomStatus>,
    cfg: RoomConfig,
    tick_every: Duration,
    started: Instant,
) {
    let (btx, _) = broadcast::channel::<Message>(BROADCAST_BUFFER);
    let mut core = RoomCore::new(cfg);
    let mut directs: HashMap<SessionId, mpsc::Sender<Direct>> = HashMap::new();
    let mut out: Vec<Outbound> = Vec::with_capacity(64);
    let mut ticker = tokio::time::interval(tick_every);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut stats = TickStats::new();
    let mut last_day_check = Instant::now() - Duration::from_secs(1);
    let now_ms = || started.elapsed().as_millis() as u64;

    tracing::info!(
        capacity = core.capacity(),
        tick_ms = tick_every.as_millis() as u64,
        "room actor chạy"
    );

    loop {
        tokio::select! {
            cmd = rx.recv() => {
                let Some(cmd) = cmd else { break };
                let t0 = Instant::now();
                match cmd {
                    RoomCmd::Enter { session, uid, tab, name, number, direct } => {
                        directs.insert(session, direct);
                        core.enter_as(session, uid, tab, &name, number, now_ms(), &mut out);
                    }
                    RoomCmd::Leave { session } => {
                        directs.remove(&session);
                        core.leave(session, now_ms(), &mut out);
                    }
                    RoomCmd::Disconnect { session } => {
                        directs.remove(&session);
                        core.disconnect(session, now_ms(), &mut out);
                    }
                    RoomCmd::Move { session, payload, client_tick } => {
                        core.on_move(session, payload, client_tick, now_ms(), &mut out)
                    }
                    RoomCmd::Chat { session, id, text } => {
                        core.on_chat(session, id, &text, now_ms(), &mut out)
                    }
                    RoomCmd::Vote { session, poll, option } => core.on_vote(session, poll, option),
                    RoomCmd::Punch { session, target } => {
                        core.on_punch(session, target, now_ms(), &mut out)
                    }
                    RoomCmd::TeleJoin { name } => core.on_tele_join(&name),
                    RoomCmd::Throw { session, slot, item, u, v } => {
                        core.on_throw(session, slot, item, u, v, now_ms())
                    }
                    RoomCmd::RageLabel { session, slot, nick } => {
                        core.on_rage_label(session, slot, nick, now_ms())
                    }
                    RoomCmd::TalkAsk { session, target } => {
                        core.on_talk_ask(session, target, now_ms(), &mut out)
                    }
                    RoomCmd::TalkCancel { session } => core.on_talk_cancel(session, &mut out),
                    RoomCmd::TalkAnswer { session, id, accept } => {
                        core.on_talk_answer(session, id, accept, now_ms(), &mut out)
                    }
                    RoomCmd::TalkEnd { session } => core.on_talk_end(session, &mut out),
                    RoomCmd::Dm { session, id, text } => {
                        core.on_dm(session, id, &text, now_ms(), &mut out)
                    }
                }
                apply(&mut out, &mut directs, &btx, &mut core, now_ms());
                stats.cmd(t0.elapsed());
            }
            _ = ticker.tick() => {
                let t0 = Instant::now();
                if last_day_check.elapsed() >= Duration::from_secs(1) {
                    last_day_check = Instant::now();
                    core.set_rage_day(vn_day());
                }
                core.tick(now_ms(), &mut out);
                apply(&mut out, &mut directs, &btx, &mut core, now_ms());
                stats.tick(t0.elapsed());
                stats.maybe_log(core.in_room(), core.waiting(), || {
                    (core.take_corrections(), core.take_session_stats())
                });
            }
        }
        status_tx.send_if_modified(|s| {
            let next = RoomStatus {
                in_room: core.in_room(),
                capacity: core.capacity(),
                waiting: core.waiting(),
            };
            if *s != next {
                *s = next;
                true
            } else {
                false
            }
        });
    }
}

fn apply(
    out: &mut Vec<Outbound>,
    directs: &mut HashMap<SessionId, mpsc::Sender<Direct>>,
    btx: &broadcast::Sender<Message>,
    core: &mut RoomCore,
    now: u64,
) {
    let mut slow: Vec<SessionId> = Vec::new();
    while !out.is_empty() {
        for o in out.drain(..) {
            match o {
                Outbound::Direct(s, m) => {
                    if let Some(d) = directs.get(&s)
                        && d.try_send(Direct::Frame(m)).is_err()
                    {
                        slow.push(s);
                    }
                }
                Outbound::Broadcast(m) => {
                    let _ = btx.send(m);
                }
                Outbound::Admit { session, frames } => {
                    if let Some(d) = directs.get(&session) {
                        let ok = d.try_send(Direct::Subscribe(btx.subscribe())).is_ok()
                            && frames
                                .into_iter()
                                .all(|f| d.try_send(Direct::Frame(f)).is_ok());
                        if !ok {
                            slow.push(session);
                        }
                    }
                }
                Outbound::Close(s, m) => {
                    if let Some(d) = directs.remove(&s) {
                        let _ = d.try_send(Direct::Close(m));
                    }
                }
            }
        }
        for s in slow.drain(..) {
            if directs.remove(&s).is_some() {
                tracing::debug!(%s, "kết nối quá chậm, mời ra");
                core.slow_kick(s, now, out);
            }
        }
    }
}

struct TickStats {
    ticks: Vec<u32>,
    cmd_count: u64,
    cmd_max_us: u32,
    last_log: Instant,
}

impl TickStats {
    fn new() -> Self {
        Self {
            ticks: Vec::with_capacity(128),
            cmd_count: 0,
            cmd_max_us: 0,
            last_log: Instant::now(),
        }
    }

    fn tick(&mut self, d: Duration) {
        self.ticks.push(d.as_micros() as u32);
    }

    fn cmd(&mut self, d: Duration) {
        self.cmd_count += 1;
        self.cmd_max_us = self.cmd_max_us.max(d.as_micros() as u32);
    }

    fn maybe_log(
        &mut self,
        in_room: usize,
        waiting: usize,
        take_counters: impl FnOnce() -> (u32, crate::game::room::SessionStats),
    ) {
        if self.last_log.elapsed() < Duration::from_secs(10) || self.ticks.is_empty() {
            return;
        }
        let (corrections, sess) = take_counters();
        self.ticks.sort_unstable();
        let p99 = self.ticks[(self.ticks.len() * 99 / 100).min(self.ticks.len() - 1)];
        let max = *self.ticks.last().unwrap_or(&0);
        tracing::info!(
            in_room,
            waiting,
            tick_p99_us = p99,
            tick_max_us = max,
            cmds = self.cmd_count,
            cmd_max_us = self.cmd_max_us,
            corrections,
            away = sess.away,
            resumed = sess.resumed,
            expired = sess.expired,
            replaced = sess.replaced,
            "room stats (10s)"
        );
        self.ticks.clear();
        self.cmd_count = 0;
        self.cmd_max_us = 0;
        self.last_log = Instant::now();
    }
}

fn vn_day() -> u32 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    ((secs + 7 * 3600) / 86_400) as u32
}
