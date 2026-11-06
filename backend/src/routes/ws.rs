use std::time::{Duration, Instant};

use axum::{
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::{
    game::{
        actor::{DIRECT_QUEUE, Direct, RoomCmd, RoomHandle},
        constants::GAME,
        protocol::{ClientBinary, ClientJson, decode_client_binary, encode_pong},
        room::{chat_dropped, sanitize_number},
    },
    guest::{self, Guest},
    state::AppState,
};

const IDLE_TIMEOUT: Duration = Duration::from_secs(20);
const SERVER_PING_AFTER: Duration = Duration::from_secs(8);
const MAX_FRAME: usize = 4096;
const MOVE_RATE: f64 = 12.0;
const MOVE_BURST: f64 = 24.0;
const CHAT_RATE: f64 = 1.0;
const CHAT_BURST: f64 = 3.0;
const PUNCH_RATE: f64 = 2.0;
const PUNCH_BURST: f64 = 3.0;
const THROW_RATE: f64 = 4.0;
const THROW_BURST: f64 = 6.0;
const LABEL_RATE: f64 = 1.0;
const LABEL_BURST: f64 = 2.0;
const TALK_RATE: f64 = 1.0;
const TALK_BURST: f64 = 4.0;
const TALK_END_RATE: f64 = 1.0;
const TALK_END_BURST: f64 = 3.0;
const DM_RATE: f64 = 3.0;
const DM_BURST: f64 = 6.0;
const RAW_CHAT_SLACK: usize = 4;

pub async fn upgrade(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    State(state): State<AppState>,
) -> Response {
    let allowed = &state.config.cors_allow_origins;
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok())
        && !allowed.is_empty()
        && !allowed.iter().any(|o| o == origin)
    {
        tracing::debug!(origin, "từ chối WebSocket: Origin không được phép");
        return StatusCode::FORBIDDEN.into_response();
    }
    let account = match guest::read_cookie(&headers) {
        Some(token) => {
            let load = guest::load_and_touch(&state.redis, &token, state.config.guest.ttl);
            match tokio::time::timeout(state.config.redis.response_timeout, load).await {
                Ok(Ok(g)) => g,
                Ok(Err(e)) => {
                    tracing::warn!(error = %e, "guest: Redis lỗi lúc vào hang — vào không tài khoản");
                    None
                }
                Err(_) => {
                    tracing::warn!("guest: Redis quá chậm lúc vào hang — vào không tài khoản");
                    None
                }
            }
        }
        None => None,
    };
    ws.max_message_size(MAX_FRAME)
        .max_frame_size(MAX_FRAME)
        .on_upgrade(move |socket| handle_socket(socket, state.room.clone(), account))
}

struct Bucket {
    rate: f64,
    burst: f64,
    tokens: f64,
    last: Instant,
}

impl Bucket {
    fn new(rate: f64, burst: f64) -> Self {
        Self {
            rate,
            burst,
            tokens: burst,
            last: Instant::now(),
        }
    }

    fn take(&mut self) -> bool {
        let now = Instant::now();
        self.tokens =
            (self.tokens + now.duration_since(self.last).as_secs_f64() * self.rate).min(self.burst);
        self.last = now;
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

fn tab_fingerprint(tab: Option<&str>) -> u64 {
    use std::hash::{DefaultHasher, Hash, Hasher};
    match tab {
        Some(t) if !t.is_empty() && t.len() <= 64 => {
            let mut h = DefaultHasher::new();
            t.hash(&mut h);
            h.finish().max(1)
        }
        _ => 0,
    }
}

fn text(v: serde_json::Value) -> Message {
    Message::Text(v.to_string().into())
}

async fn handle_socket(socket: WebSocket, room: RoomHandle, account: Option<Guest>) {
    let session = Uuid::new_v4();
    let (mut sink, mut stream) = socket.split();
    let (direct_tx, mut direct_rx) = mpsc::channel::<Direct>(DIRECT_QUEUE);
    let mut bcast: Option<broadcast::Receiver<Message>> = None;
    let mut entered = false;
    let mut last_heard = Instant::now();
    let mut bucket = Bucket::new(MOVE_RATE, MOVE_BURST);
    let mut chat_bucket = Bucket::new(CHAT_RATE, CHAT_BURST);
    let mut punch_bucket = Bucket::new(PUNCH_RATE, PUNCH_BURST);
    let mut throw_bucket = Bucket::new(THROW_RATE, THROW_BURST);
    let mut label_bucket = Bucket::new(LABEL_RATE, LABEL_BURST);
    let mut talk_bucket = Bucket::new(TALK_RATE, TALK_BURST);
    let mut dm_bucket = Bucket::new(DM_RATE, DM_BURST);
    let mut talk_end_bucket = Bucket::new(TALK_END_RATE, TALK_END_BURST);
    let mut idle = tokio::time::interval(Duration::from_secs(5));
    let mut left = false;

    loop {
        tokio::select! {
            biased;

            d = direct_rx.recv() => match d {
                Some(Direct::Frame(m)) => if sink.send(m).await.is_err() { break },
                Some(Direct::Subscribe(rx)) => bcast = Some(rx),
                Some(Direct::Close(m)) => {
                    let _ = sink.send(m).await;
                    break;
                }
                None => break,
            },

            msg = stream.next() => {
                let Some(Ok(msg)) = msg else { break };
                last_heard = Instant::now();
                match msg {
                    Message::Binary(b) => match decode_client_binary(&b) {
                        Some(ClientBinary::Ping(t)) => {
                            if sink.send(Message::Binary(encode_pong(t, room.server_tick()))).await.is_err() {
                                break;
                            }
                        }
                        Some(ClientBinary::Move(payload, client_tick)) if entered && bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::Move { session, payload, client_tick });
                        }
                        _ => {}
                    },
                    Message::Text(t) => match serde_json::from_str::<ClientJson>(t.as_str()) {
                        Ok(ClientJson::Enter { name, number, tab }) if !entered => {
                            entered = true;
                            let tab = tab_fingerprint(tab.as_deref());
                            let (uid, name, number) = match &account {
                                Some(g) => (Some(g.uid), g.name.clone(), g.number),
                                None => (None, name, sanitize_number(number)),
                            };
                            let cmd = RoomCmd::Enter { session, uid, tab, name, number, direct: direct_tx.clone() };
                            if room.tx.try_send(cmd).is_err() {
                                let _ = sink.send(text(json!({ "t": "busy", "retryAfter": 3 }))).await;
                                entered = false;
                                break;
                            }
                        }
                        Ok(ClientJson::Chat { text: body, id }) if entered => {
                            let reason = if body.chars().count() > GAME.chat_max_chars * RAW_CHAT_SLACK {
                                Some("invalid")
                            } else if !chat_bucket.take() {
                                Some("rate")
                            } else if room.tx.try_send(RoomCmd::Chat { session, id, text: body }).is_err() {
                                Some("busy")
                            } else {
                                None
                            };
                            if let Some(r) = reason
                                && sink.send(chat_dropped(r, id)).await.is_err()
                            {
                                break;
                            }
                        }
                        Ok(ClientJson::Vote { poll, option }) if entered && chat_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::Vote { session, poll, option });
                        }
                        Ok(ClientJson::Punch { target }) if entered && punch_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::Punch { session, target });
                        }
                        Ok(ClientJson::Throw { slot, item, u, v }) if entered && throw_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::Throw { session, slot, item, u, v });
                        }
                        Ok(ClientJson::RageLabel { slot, nick }) if entered && label_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::RageLabel { session, slot, nick });
                        }
                        Ok(ClientJson::TalkEnd) if entered && talk_end_bucket.take() => {
                            let _ = room.tx.send(RoomCmd::TalkEnd { session }).await;
                        }
                        Ok(ClientJson::TalkAsk { target }) if entered && talk_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::TalkAsk { session, target });
                        }
                        Ok(ClientJson::TalkCancel) if entered && talk_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::TalkCancel { session });
                        }
                        Ok(ClientJson::TalkAnswer { id, accept }) if entered && talk_bucket.take() => {
                            let _ = room.tx.try_send(RoomCmd::TalkAnswer { session, id, accept });
                        }
                        Ok(ClientJson::Dm { text: body, id }) if entered => {
                            let reason = if body.chars().count() > GAME.chat_max_chars * RAW_CHAT_SLACK {
                                Some("invalid")
                            } else if !dm_bucket.take() {
                                Some("rate")
                            } else if room.tx.try_send(RoomCmd::Dm { session, id, text: body }).is_err() {
                                Some("busy")
                            } else {
                                None
                            };
                            if let Some(r) = reason
                                && sink.send(text(json!({ "t": "dmDropped", "id": id, "reason": r }))).await.is_err()
                            {
                                break;
                            }
                        }
                        Ok(ClientJson::Leave | ClientJson::Cancel) => {
                            left = true;
                            break;
                        }
                        _ => {}
                    },
                    Message::Close(_) => break,
                    _ => {}
                }
            }

            r = async { bcast.as_mut().expect("guard").recv().await }, if bcast.is_some() => match r {
                Ok(m) => if sink.send(m).await.is_err() { break },
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::debug!(%session, n, "client chậm, bỏ qua tin broadcast cũ");
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },

            _ = idle.tick() => {
                let quiet = last_heard.elapsed();
                if quiet > IDLE_TIMEOUT {
                    break;
                }
                if quiet > SERVER_PING_AFTER && sink.send(Message::Ping(Default::default())).await.is_err() {
                    break;
                }
            }
        }
    }

    if entered {
        let cmd = if left {
            RoomCmd::Leave { session }
        } else {
            RoomCmd::Disconnect { session }
        };
        let _ = room.tx.send(cmd).await;
    }
    let _ = sink.close().await;
}
