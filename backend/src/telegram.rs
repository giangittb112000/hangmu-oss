use std::{
    collections::HashMap,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;

use crate::{config::TelegramConfig, game::actor::RoomCmd};

const POLL_TIMEOUT_SECS: u64 = 30;
const STALE_SECS: i64 = 60;
const REPEAT_SECS: i64 = 30 * 60;
const BACKOFF_MIN: Duration = Duration::from_secs(5);
const BACKOFF_MAX: Duration = Duration::from_secs(60);
const CONFLICT_WAIT: Duration = Duration::from_secs(30);

#[derive(Deserialize)]
struct Resp {
    ok: bool,
    #[serde(default)]
    result: Vec<serde_json::Value>,
    #[serde(default)]
    error_code: Option<u16>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Deserialize)]
struct Update {
    #[serde(default)]
    chat_member: Option<ChatMemberUpdated>,
}

#[derive(Deserialize)]
struct ChatMemberUpdated {
    chat: Chat,
    date: i64,
    old_chat_member: Member,
    new_chat_member: Member,
}

#[derive(Deserialize)]
struct Member {
    status: String,
    user: User,
    #[serde(default)]
    is_member: Option<bool>,
}

#[derive(Deserialize)]
struct User {
    id: i64,
    is_bot: bool,
    first_name: String,
}

#[derive(Deserialize)]
struct Chat {
    id: i64,
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn is_join(old: &Member, new: &Member) -> bool {
    let was_out = matches!(old.status.as_str(), "left" | "kicked");
    let now_in =
        new.status == "member" || (new.status == "restricted" && new.is_member == Some(true));
    was_out && now_in && !new.user.is_bot
}

pub async fn run(cfg: TelegramConfig, room: mpsc::Sender<RoomCmd>) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(POLL_TIMEOUT_SECS + 10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(error = %e.without_url(), "không tạo được HTTP client cho Telegram");
            return;
        }
    };
    let url = format!("https://api.telegram.org/bot{}/getUpdates", cfg.token);
    let chat_id = cfg.chat_id;
    let started = unix_now();
    let mut offset: i64 = 0;
    let mut backoff = BACKOFF_MIN;
    let mut announced: HashMap<i64, i64> = HashMap::new();
    tracing::info!(chat_id, "bot Telegram: bắt đầu nhận người vào group");

    loop {
        let body = json!({
            "offset": offset,
            "timeout": POLL_TIMEOUT_SECS,
            "allowed_updates": ["chat_member"],
        });
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r.json::<Resp>().await,
            Err(e) => Err(e),
        };
        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(error = %e.without_url(), ?backoff, "Telegram getUpdates lỗi, thử lại sau");
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(BACKOFF_MAX);
                continue;
            }
        };
        if !resp.ok {
            let wait = if resp.error_code == Some(409) {
                tracing::warn!(
                    "Telegram 409: nơi khác đang đọc cập nhật bằng cùng token (dev + production?) — chờ rồi thử lại"
                );
                CONFLICT_WAIT
            } else {
                tracing::warn!(code = ?resp.error_code, desc = ?resp.description, "Telegram trả lỗi");
                backoff
            };
            tokio::time::sleep(wait).await;
            backoff = (backoff * 2).min(BACKOFF_MAX);
            continue;
        }
        backoff = BACKOFF_MIN;

        let now = unix_now();
        announced.retain(|_, t| now - *t < REPEAT_SECS);
        for raw in resp.result {
            if let Some(id) = raw.get("update_id").and_then(|v| v.as_i64()) {
                offset = offset.max(id + 1);
            }
            let cm = match serde_json::from_value::<Update>(raw) {
                Ok(Update {
                    chat_member: Some(cm),
                }) => cm,
                Ok(_) => continue,
                Err(e) => {
                    tracing::debug!(error = %e, "bỏ qua cập nhật Telegram không đọc được");
                    continue;
                }
            };
            if cm.chat.id != chat_id {
                tracing::warn!(
                    got = cm.chat.id,
                    expected = chat_id,
                    "sự kiện thành viên từ group khác — nếu group đã đổi id (nâng supergroup), cập nhật TELEGRAM_CHAT_ID"
                );
                continue;
            }
            if cm.date < started - STALE_SECS || !is_join(&cm.old_chat_member, &cm.new_chat_member)
            {
                continue;
            }
            let user = &cm.new_chat_member.user;
            if announced.contains_key(&user.id) {
                continue;
            }
            let name = user.first_name.clone();
            match room.try_send(RoomCmd::TeleJoin { name }) {
                Ok(()) => {
                    announced.insert(user.id, now);
                }
                Err(_) => tracing::debug!("hang đang bận, bỏ thông báo người vào group"),
            }
        }
    }
}
