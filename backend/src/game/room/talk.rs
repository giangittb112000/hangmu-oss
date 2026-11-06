use std::collections::HashMap;

use axum::extract::ws::Message;
use serde_json::{Value, json};

use super::{GAME, Outbound, PUNCH_LAG_MS, RoomCore, SessionId, clean_text, seg_dist};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TalkConfig {
    pub invite_ms: u64,
    pub ask_gap_ms: u64,
    pub decline_cooldown_ms: u64,
    pub idle_ms: u64,
    pub dm_min_gap_ms: u64,
}

impl TalkConfig {
    pub const DEFAULT: Self = Self {
        invite_ms: 20_000,
        ask_gap_ms: 10_000,
        decline_cooldown_ms: 60_000,
        idle_ms: 10 * 60_000,
        dm_min_gap_ms: 400,
    };
}

impl Default for TalkConfig {
    fn default() -> Self {
        Self::DEFAULT
    }
}

const BOT_DECLINE_MS: (u64, u64) = (3_000, 7_000);
const SWEEP_MS: u64 = 500;

#[derive(Debug)]
struct Invite {
    id: u32,
    from: u16,
    to: u16,
    expires: u64,
    bot: bool,
}

#[derive(Debug)]
struct Conv {
    id: u32,
    a: u16,
    b: u16,
    last_activity: u64,
}

impl Conv {
    fn peer_of(&self, i: u16) -> u16 {
        if self.a == i { self.b } else { self.a }
    }
}

#[derive(Debug, Default)]
pub struct Talks {
    next_id: u32,
    invites: Vec<Invite>,
    convs: Vec<Conv>,
    last_ask: HashMap<u16, u64>,
    last_dm: HashMap<u16, u64>,
    cooldown: HashMap<(u16, u16), u64>,
    last_sweep: u64,
}

impl Talks {
    pub fn is_talking(&self, i: u16) -> bool {
        self.convs.iter().any(|c| c.a == i || c.b == i)
    }

    fn conv_of(&self, i: u16) -> Option<usize> {
        self.convs.iter().position(|c| c.a == i || c.b == i)
    }

    fn has_invite(&self, i: u16) -> bool {
        self.invites.iter().any(|v| v.from == i || v.to == i)
    }

    pub fn talking_indices(&self) -> Vec<u16> {
        self.convs.iter().flat_map(|c| [c.a, c.b]).collect()
    }

    fn new_id(&mut self) -> u32 {
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.next_id
    }
}

fn msg(v: Value) -> Message {
    Message::Text(v.to_string().into())
}

pub fn talking_msg(on: &[u16], off: &[u16]) -> Message {
    let mut v = json!({ "t": "talking" });
    if !on.is_empty() {
        v["on"] = json!(on);
    }
    if !off.is_empty() {
        v["off"] = json!(off);
    }
    msg(v)
}

pub fn strip_contacts(text: &str) -> String {
    const TLDS: &[&str] = &[
        "com", "vn", "net", "org", "io", "me", "ly", "gg", "xyz", "link", "top", "info", "online",
        "site", "app", "co", "cc", "tk", "club", "shop", "live", "pro", "biz", "us", "asia",
    ];
    let mut out: Vec<String> = Vec::new();
    for word in text.split(' ') {
        let lower = word.to_lowercase();
        let host = lower
            .trim_start_matches(|c: char| !c.is_alphanumeric())
            .split(['/', '?', '#', ':'])
            .next()
            .unwrap_or_default();
        let bare = host.trim_end_matches(|c: char| !c.is_alphanumeric());
        let is_link = lower.contains("://")
            || lower.starts_with("www.")
            || bare.rsplit_once('.').is_some_and(|(host, tld)| {
                !host.is_empty()
                    && host.chars().any(|c| c.is_ascii_alphabetic())
                    && TLDS.contains(&tld)
            });
        out.push(if is_link {
            "[link]".into()
        } else {
            word.into()
        });
    }
    let joined = out.join(" ");
    let chars: Vec<char> = joined.chars().collect();
    let mut res = String::with_capacity(joined.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_digit()
            || (chars[i] == '+' && chars.get(i + 1).is_some_and(|c| c.is_ascii_digit()))
        {
            let start = i;
            let mut digits = 0;
            let mut end = i;
            let mut j = i;
            while j < chars.len() {
                let c = chars[j];
                if c.is_ascii_digit() {
                    digits += 1;
                    end = j + 1;
                } else if !(c == ' ' || c == '.' || c == '-' || (c == '+' && j == start)) {
                    break;
                }
                j += 1;
            }
            if digits >= 9 {
                res.push_str("[số]");
            } else {
                res.extend(&chars[start..end.max(start + 1)]);
            }
            i = end.max(start + 1);
        } else {
            res.push(chars[i]);
            i += 1;
        }
    }
    res
}

impl RoomCore {
    fn talk_index(&self, session: SessionId) -> Option<u16> {
        self.index_of(session)
    }

    fn direct_to(&self, index: u16, out: &mut Vec<Outbound>, m: Message) {
        if let Some(Some(p)) = self.slots.get(index as usize)
            && let Some(s) = p.session
        {
            out.push(Outbound::Direct(s, m));
        }
    }

    pub(super) fn frozen(&self, index: u16) -> bool {
        self.talks.is_talking(index)
    }

    pub fn on_talk_ask(
        &mut self,
        session: SessionId,
        target: u16,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        let Some(from) = self.talk_index(session) else {
            return;
        };
        let decline = |reason: &str| {
            Outbound::Direct(
                session,
                msg(json!({ "t": "talkDeclined", "target": target, "reason": reason })),
            )
        };
        let (Some(Some(a)), Some(Some(b))) = (
            self.slots.get(from as usize),
            self.slots.get(target as usize),
        ) else {
            return out.push(decline("no"));
        };
        if from == target {
            return;
        }
        if self.talks.is_talking(from) || self.talks.invites.iter().any(|v| v.from == from) {
            return out.push(decline("wait"));
        }
        if self
            .talks
            .last_ask
            .get(&from)
            .is_some_and(|t| now.saturating_sub(*t) < self.cfg.talk.ask_gap_ms)
        {
            return out.push(decline("wait"));
        }
        if b.away_until.is_some() {
            return out.push(decline("busy"));
        }
        let bot = b.session.is_none();
        let name = a.name.clone();
        if self
            .talk_dist(from, target, now)
            .is_none_or(|d| d > GAME.talk_range)
        {
            return out.push(decline("far"));
        }
        if let Some(k) = self
            .talks
            .invites
            .iter()
            .position(|v| v.from == target && v.to == from)
        {
            let v = self.talks.invites.remove(k);
            self.talks.last_ask.insert(from, now);
            return self.open_talk(v.id, target, from, now, out);
        }
        if self.talks.is_talking(target) || self.talks.has_invite(target) {
            return out.push(decline("busy"));
        }
        if let Some(until) = self
            .talks
            .cooldown
            .get(&(from, target))
            .copied()
            .filter(|t| now < *t)
        {
            return out.push(Outbound::Direct(
                session,
                msg(json!({
                    "t": "talkDeclined", "target": target, "reason": "cooldown", "waitMs": until - now
                })),
            ));
        }
        let id = self.talks.new_id();
        let expires = if bot {
            now + self.rng.ms(BOT_DECLINE_MS.0, BOT_DECLINE_MS.1)
        } else {
            now + self.cfg.talk.invite_ms
        };
        self.talks.last_ask.insert(from, now);
        self.talks.invites.push(Invite {
            id,
            from,
            to: target,
            expires,
            bot,
        });
        out.push(Outbound::Direct(
            session,
            msg(json!({ "t": "talkAsked", "target": target, "id": id, "ms": self.cfg.talk.invite_ms })),
        ));
        if !bot {
            self.direct_to(
                target,
                out,
                msg(json!({ "t": "talkInvite", "id": id, "from": from, "name": name, "ms": self.cfg.talk.invite_ms })),
            );
        }
    }

    pub fn on_talk_cancel(&mut self, session: SessionId, out: &mut Vec<Outbound>) {
        let Some(from) = self.talk_index(session) else {
            return;
        };
        if let Some(k) = self.talks.invites.iter().position(|v| v.from == from) {
            let v = self.talks.invites.remove(k);
            self.direct_to(v.to, out, msg(json!({ "t": "talkInviteGone", "id": v.id })));
        }
    }

    pub fn on_talk_answer(
        &mut self,
        session: SessionId,
        id: u32,
        accept: bool,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        let Some(to) = self.talk_index(session) else {
            return;
        };
        let Some(k) = self
            .talks
            .invites
            .iter()
            .position(|v| v.id == id && v.to == to)
        else {
            return;
        };
        let v = self.talks.invites.remove(k);
        if !accept {
            self.talks
                .cooldown
                .insert((v.from, to), now + self.cfg.talk.decline_cooldown_ms);
            self.direct_to(
                v.from,
                out,
                msg(json!({
                    "t": "talkDeclined", "target": to, "reason": "declined",
                    "waitMs": self.cfg.talk.decline_cooldown_ms
                })),
            );
            return;
        }
        if self.talks.is_talking(v.from) || self.talks.is_talking(to) {
            return;
        }
        if self
            .talk_dist(to, v.from, now)
            .is_none_or(|d| d > GAME.talk_range)
        {
            self.direct_to(
                v.from,
                out,
                msg(json!({ "t": "talkDeclined", "target": to, "reason": "far" })),
            );
            self.direct_to(
                to,
                out,
                msg(json!({ "t": "talkDeclined", "target": v.from, "reason": "gone" })),
            );
            return;
        }
        if let Some(k2) = self.talks.invites.iter().position(|x| x.from == to) {
            let x = self.talks.invites.remove(k2);
            self.direct_to(x.to, out, msg(json!({ "t": "talkInviteGone", "id": x.id })));
        }
        self.open_talk(v.id, v.from, to, now, out);
    }

    fn open_talk(&mut self, id: u32, a: u16, b: u16, now: u64, out: &mut Vec<Outbound>) {
        let (Some(Some(pa)), Some(Some(pb))) =
            (self.slots.get(a as usize), self.slots.get(b as usize))
        else {
            return;
        };
        let (name_a, name_b) = (pa.name.clone(), pb.name.clone());
        self.talks.convs.push(Conv {
            id,
            a,
            b,
            last_activity: now,
        });
        for (me, peer, name) in [(a, b, &name_b), (b, a, &name_a)] {
            self.direct_to(
                me,
                out,
                msg(json!({ "t": "talkOpen", "id": id, "peer": peer, "name": name })),
            );
        }
        out.push(Outbound::Broadcast(talking_msg(&[a, b], &[])));
    }

    fn talk_dist(&self, a: u16, b: u16, now: u64) -> Option<f32> {
        let pa = self.slots.get(a as usize)?.as_ref()?;
        let pb = self.slots.get(b as usize)?.as_ref()?;
        Some(seg_dist(
            pa.pos_at(now),
            pb.pos_at(now.saturating_sub(PUNCH_LAG_MS)),
            pb.pos_at(now),
        ))
    }

    fn close_talk(&mut self, k: usize, by: u16, reason: &str, out: &mut Vec<Outbound>) {
        let c = self.talks.convs.remove(k);
        let m = json!({ "t": "talkClosed", "id": c.id, "by": by, "reason": reason });
        for i in [c.a, c.b] {
            if reason == "left" && i == by {
                continue;
            }
            self.direct_to(i, out, msg(m.clone()));
        }
        out.push(Outbound::Broadcast(talking_msg(&[], &[c.a, c.b])));
    }

    pub fn on_talk_end(&mut self, session: SessionId, out: &mut Vec<Outbound>) {
        let Some(i) = self.talk_index(session) else {
            return;
        };
        if let Some(k) = self.talks.conv_of(i) {
            self.close_talk(k, i, "end", out);
        }
    }

    pub fn on_dm(
        &mut self,
        session: SessionId,
        id: u32,
        raw: &str,
        now: u64,
        out: &mut Vec<Outbound>,
    ) {
        let Some(i) = self.talk_index(session) else {
            return;
        };
        let dropped = |reason: &str| {
            Outbound::Direct(
                session,
                msg(json!({ "t": "dmDropped", "id": id, "reason": reason })),
            )
        };
        let Some(k) = self.talks.conv_of(i) else {
            return out.push(dropped("closed"));
        };
        let text = clean_text(raw);
        let n = text.chars().count();
        if !(1..=GAME.chat_max_chars).contains(&n) {
            return out.push(dropped("invalid"));
        }
        if self
            .talks
            .last_dm
            .get(&i)
            .is_some_and(|t| now.saturating_sub(*t) < self.cfg.talk.dm_min_gap_ms)
        {
            return out.push(dropped("rate"));
        }
        self.talks.last_dm.insert(i, now);
        let clean = strip_contacts(&self.cfg.chat_filter.clean(&text));
        let c = &mut self.talks.convs[k];
        c.last_activity = now;
        let peer = c.peer_of(i);
        self.direct_to(peer, out, msg(json!({ "t": "dm", "text": clean })));
        out.push(Outbound::Direct(
            session,
            msg(json!({ "t": "dmAck", "id": id, "text": clean })),
        ));
    }

    pub(super) fn talk_forget(&mut self, index: u16, out: &mut Vec<Outbound>) {
        if let Some(k) = self.talks.conv_of(index) {
            self.close_talk(k, index, "left", out);
        }
        let gone: Vec<Invite> = self
            .talks
            .invites
            .extract_if(.., |v| v.from == index || v.to == index)
            .collect();
        for v in gone {
            if v.from == index {
                if !v.bot {
                    self.direct_to(v.to, out, msg(json!({ "t": "talkInviteGone", "id": v.id })));
                }
            } else {
                self.direct_to(
                    v.from,
                    out,
                    msg(json!({ "t": "talkDeclined", "target": v.to, "reason": "no" })),
                );
            }
        }
        self.talks.last_ask.remove(&index);
        self.talks.last_dm.remove(&index);
        self.talks
            .cooldown
            .retain(|(a, b), _| *a != index && *b != index);
    }

    pub(super) fn talk_tick(&mut self, now: u64, out: &mut Vec<Outbound>) {
        if now.saturating_sub(self.talks.last_sweep) < SWEEP_MS {
            return;
        }
        self.talks.last_sweep = now;
        let expired: Vec<Invite> = self
            .talks
            .invites
            .extract_if(.., |v| now >= v.expires)
            .collect();
        for v in expired {
            self.direct_to(
                v.from,
                out,
                msg(json!({ "t": "talkDeclined", "target": v.to, "reason": "no" })),
            );
            if !v.bot {
                self.direct_to(v.to, out, msg(json!({ "t": "talkInviteGone", "id": v.id })));
            }
        }
        let idle_ms = self.cfg.talk.idle_ms;
        while let Some(k) = self
            .talks
            .convs
            .iter()
            .position(|c| now.saturating_sub(c.last_activity) >= idle_ms)
        {
            let by = self.talks.convs[k].a;
            self.close_talk(k, by, "idle", out);
        }
        self.talks.cooldown.retain(|_, t| now < *t);
    }
}
