use std::{
    collections::HashMap,
    sync::LazyLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::http::{HeaderMap, HeaderValue, header};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use redis::{AsyncCommands, RedisResult, aio::ConnectionManager};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::config::GuestSettings;
use crate::game::room::{sanitize_name, sanitize_number};

pub const COOKIE: &str = "hm_sid";
const TOKEN_LEN: usize = 43;
const RENAME_PER_HOUR: u32 = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Guest {
    pub uid: Uuid,
    pub name: String,
    pub number: Option<u8>,
}

pub fn new_token() -> String {
    let mut buf = [0u8; 32];
    getrandom::fill(&mut buf).expect("RNG hệ điều hành không dùng được");
    URL_SAFE_NO_PAD.encode(buf)
}

fn key(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    let mut hex = String::with_capacity(64);
    for b in digest.iter() {
        hex.push_str(&format!("{b:02x}"));
    }
    format!("hangmu:guest:{hex}")
}

fn valid_token(t: &str) -> bool {
    t.len() == TOKEN_LEN
        && t.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn parse(map: &HashMap<String, String>) -> Option<Guest> {
    let uid = map.get("uid")?.parse::<Uuid>().ok()?;
    let name = sanitize_name(map.get("name")?)?;
    let number = sanitize_number(map.get("number").and_then(|n| n.parse::<i64>().ok()));
    Some(Guest { uid, name, number })
}

async fn finish(
    c: &mut ConnectionManager,
    k: &str,
    map: HashMap<String, String>,
) -> RedisResult<Option<Guest>> {
    if map.is_empty() {
        return Ok(None);
    }
    match parse(&map) {
        Some(g) => Ok(Some(g)),
        None => {
            tracing::warn!("guest: key Redis hỏng (thiếu uid/tên) → xoá");
            let _: () = c.del(k).await?;
            Ok(None)
        }
    }
}

pub async fn peek(redis: &ConnectionManager, token: &str) -> RedisResult<Option<Guest>> {
    let mut c = redis.clone();
    let k = key(token);
    let map: HashMap<String, String> = c.hgetall(&k).await?;
    finish(&mut c, &k, map).await
}

pub async fn load_and_touch(
    redis: &ConnectionManager,
    token: &str,
    ttl: Duration,
) -> RedisResult<Option<Guest>> {
    let mut c = redis.clone();
    let k = key(token);
    let (map,): (HashMap<String, String>,) = redis::pipe()
        .hgetall(&k)
        .expire(&k, ttl.as_secs() as i64)
        .ignore()
        .query_async(&mut c)
        .await?;
    finish(&mut c, &k, map).await
}

fn number_field(number: Option<u8>) -> String {
    number.map(|n| n.to_string()).unwrap_or_default()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub async fn create(
    redis: &ConnectionManager,
    name: String,
    number: Option<u8>,
    ttl: Duration,
) -> RedisResult<(String, Guest)> {
    let mut c = redis.clone();
    let token = new_token();
    let guest = Guest {
        uid: Uuid::new_v4(),
        name,
        number,
    };
    let k = key(&token);
    let fields = [
        ("uid", guest.uid.to_string()),
        ("name", guest.name.clone()),
        ("number", number_field(number)),
        ("created", now_ms().to_string()),
    ];
    let () = redis::pipe()
        .atomic()
        .hset_multiple(&k, &fields)
        .ignore()
        .expire(&k, ttl.as_secs() as i64)
        .ignore()
        .query_async(&mut c)
        .await?;
    Ok((token, guest))
}

static RENAME: LazyLock<redis::Script> = LazyLock::new(|| {
    redis::Script::new(
        r"if redis.call('EXISTS', KEYS[1]) == 1 then
            redis.call('HSET', KEYS[1], 'name', ARGV[1], 'number', ARGV[2])
            return redis.call('HGET', KEYS[1], 'uid')
          end
          return false",
    )
});

pub async fn rename(
    redis: &ConnectionManager,
    token: &str,
    name: String,
    number: Option<u8>,
) -> RedisResult<Option<Guest>> {
    let mut c = redis.clone();
    let uid: Option<String> = RENAME
        .key(key(token))
        .arg(&name)
        .arg(number_field(number))
        .invoke_async(&mut c)
        .await?;
    Ok(uid
        .and_then(|u| u.parse::<Uuid>().ok())
        .map(|uid| Guest { uid, name, number }))
}

async fn within(
    c: &mut ConnectionManager,
    k: &str,
    window_secs: u64,
    max: u32,
) -> RedisResult<bool> {
    let (n,): (u32,) = redis::pipe()
        .incr(k, 1)
        .expire(k, window_secs as i64 + 5)
        .ignore()
        .query_async(c)
        .await?;
    Ok(n <= max)
}

pub async fn allow_create(redis: &ConnectionManager, cfg: &GuestSettings) -> RedisResult<bool> {
    let mut c = redis.clone();
    let all = format!("hangmu:guestrate:all:{}", now_ms() / 60_000);
    let ok = within(&mut c, &all, 60, cfg.create_per_min).await?;
    if !ok {
        tracing::warn!("guest: chạm trần tạo tài khoản toàn hệ thống / phút");
    }
    Ok(ok)
}

pub async fn allow_rename(redis: &ConnectionManager, uid: Uuid) -> RedisResult<bool> {
    let mut c = redis.clone();
    let k = format!("hangmu:rename:{uid}:{}", now_ms() / 1000 / 3600);
    within(&mut c, &k, 3600, RENAME_PER_HOUR).await
}

pub fn read_cookie(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|kv| kv.trim().strip_prefix(COOKIE)?.strip_prefix('='))
        .find(|t| valid_token(t))
        .map(str::to_owned)
}

pub fn set_cookie(token: &str, max_age: Duration, secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    let v = format!(
        "{COOKIE}={token}; Path=/; Max-Age={}; HttpOnly; SameSite=Lax{secure}",
        max_age.as_secs()
    );
    HeaderValue::from_str(&v).expect("token base64url là ASCII hợp lệ")
}

pub fn clear_cookie(secure: bool) -> HeaderValue {
    let secure = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure}"
    ))
    .expect("ASCII")
}
