use bytes::{BufMut, Bytes, BytesMut};
use serde::Deserialize;

use super::constants::GAME;

pub mod op {
    pub const MOVE: u8 = 0x01;
    pub const PING: u8 = 0x02;
    pub const WELCOME: u8 = 0x80;
    pub const MOVES: u8 = 0x81;
    pub const CORRECTION: u8 = 0x82;
    pub const PONG: u8 = 0x83;
}

pub fn q_pos(m: f32) -> i16 {
    (m * GAME.pos_scale)
        .round()
        .clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

pub fn dq_pos(v: i16) -> f32 {
    v as f32 / GAME.pos_scale
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MovePayload {
    pub x: i16,
    pub z: i16,
    pub heading: u8,
    pub dir: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MoveRecord {
    pub index: u16,
    pub tick: u16,
    pub m: MovePayload,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ClientBinary {
    Move(MovePayload, u16),
    Ping(u32),
}

pub fn decode_client_binary(b: &[u8]) -> Option<ClientBinary> {
    match (b.first()?, b.len()) {
        (&op::MOVE, 9) => Some(ClientBinary::Move(
            MovePayload {
                x: i16::from_le_bytes([b[1], b[2]]),
                z: i16::from_le_bytes([b[3], b[4]]),
                heading: b[5],
                dir: b[6],
            },
            u16::from_le_bytes([b[7], b[8]]),
        )),
        (&op::PING, 5) => Some(ClientBinary::Ping(u32::from_le_bytes([
            b[1], b[2], b[3], b[4],
        ]))),
        _ => None,
    }
}

#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum ClientJson {
    Enter {
        name: String,
        #[serde(default)]
        number: Option<i64>,
        #[serde(default)]
        tab: Option<String>,
    },
    Cancel,
    Leave,
    Chat {
        text: String,
        #[serde(default)]
        id: u32,
    },
    Punch {
        target: u16,
    },
    Vote {
        poll: u32,
        option: u8,
    },
    Throw {
        slot: u8,
        item: u8,
        u: f32,
        v: f32,
    },
    #[serde(rename = "rageLabel")]
    RageLabel {
        slot: u8,
        nick: u8,
    },
    #[serde(rename = "talkAsk")]
    TalkAsk {
        target: u16,
    },
    #[serde(rename = "talkCancel")]
    TalkCancel,
    #[serde(rename = "talkAnswer")]
    TalkAnswer {
        id: u32,
        accept: bool,
    },
    #[serde(rename = "talkEnd")]
    TalkEnd,
    Dm {
        text: String,
        #[serde(default)]
        id: u32,
    },
}

pub fn encode_moves(server_tick: u16, records: &[MoveRecord]) -> Bytes {
    let mut b = BytesMut::with_capacity(5 + records.len() * 10);
    b.put_u8(op::MOVES);
    b.put_u16_le(server_tick);
    b.put_u16_le(records.len() as u16);
    for r in records {
        b.put_u16_le(r.index);
        b.put_u16_le(r.tick);
        b.put_i16_le(r.m.x);
        b.put_i16_le(r.m.z);
        b.put_u8(r.m.heading);
        b.put_u8(r.m.dir);
    }
    b.freeze()
}

pub fn encode_welcome(entries: &[(u16, MovePayload)]) -> Bytes {
    let mut b = BytesMut::with_capacity(3 + entries.len() * 8);
    b.put_u8(op::WELCOME);
    b.put_u16_le(entries.len() as u16);
    for (index, m) in entries {
        b.put_u16_le(*index);
        b.put_i16_le(m.x);
        b.put_i16_le(m.z);
        b.put_u8(m.heading);
        b.put_u8(m.dir);
    }
    b.freeze()
}

pub fn encode_correction(x: i16, z: i16) -> Bytes {
    let mut b = BytesMut::with_capacity(5);
    b.put_u8(op::CORRECTION);
    b.put_i16_le(x);
    b.put_i16_le(z);
    b.freeze()
}

pub fn encode_pong(client_time: u32, server_tick: u16) -> Bytes {
    let mut b = BytesMut::with_capacity(7);
    b.put_u8(op::PONG);
    b.put_u32_le(client_time);
    b.put_u16_le(server_tick);
    b.freeze()
}
