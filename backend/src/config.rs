use std::{env, str::FromStr, time::Duration};

use anyhow::{Context, Result, bail};

#[derive(Debug, Clone)]
pub struct Config {
    pub app_env: String,
    pub domain: String,
    pub host: String,
    pub port: u16,
    pub api_timeout: Duration,
    pub run_migrations: bool,
    pub cors_allow_origins: Vec<String>,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub room: RoomSettings,
    pub quiz_cache_ttl: Duration,
    pub telegram: Option<TelegramConfig>,
    pub guest: GuestSettings,
}

#[derive(Debug, Clone)]
pub struct GuestSettings {
    pub ttl: Duration,
    pub cookie_max_age: Duration,
    pub cookie_secure: bool,
    pub create_per_min: u32,
}

#[derive(Clone)]
pub struct TelegramConfig {
    pub token: String,
    pub chat_id: i64,
}

impl std::fmt::Debug for TelegramConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TelegramConfig")
            .field("token", &"***")
            .field("chat_id", &self.chat_id)
            .finish()
    }
}

#[derive(Debug, Clone)]
pub struct RoomSettings {
    pub capacity: usize,
    pub queue_max: usize,
    pub tick_ms: u64,
    pub admit_per_sec: u32,
    pub chat_flush_ms: u64,
    pub chat_max_per_sec: u32,
    pub chat_blacklist_file: Option<String>,
    pub bots: usize,
    pub talk: crate::game::room::TalkConfig,
    pub reconnect_hold_ms: u64,
}

#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub acquire_timeout: Duration,
    pub idle_timeout: Duration,
    pub max_lifetime: Duration,
}

#[derive(Debug, Clone)]
pub struct RedisConfig {
    pub url: String,
    pub connect_timeout: Duration,
    pub response_timeout: Duration,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let database = DatabaseConfig {
            url: required("DATABASE_URL")?,
            max_connections: parse_or("DB_POOL_MAX_CONNECTIONS", 10)?,
            min_connections: parse_or("DB_POOL_MIN_CONNECTIONS", 1)?,
            acquire_timeout: Duration::from_millis(parse_or("DB_POOL_ACQUIRE_TIMEOUT_MS", 3_000)?),
            idle_timeout: Duration::from_secs(parse_or("DB_POOL_IDLE_TIMEOUT_SECS", 600)?),
            max_lifetime: Duration::from_secs(parse_or("DB_POOL_MAX_LIFETIME_SECS", 1_800)?),
        };
        if database.max_connections == 0 {
            bail!("DB_POOL_MAX_CONNECTIONS phải > 0");
        }
        if database.min_connections > database.max_connections {
            bail!("DB_POOL_MIN_CONNECTIONS không được lớn hơn DB_POOL_MAX_CONNECTIONS");
        }

        let redis = RedisConfig {
            url: required("REDIS_URL")?,
            connect_timeout: Duration::from_millis(parse_or("REDIS_CONNECT_TIMEOUT_MS", 3_000)?),
            response_timeout: Duration::from_millis(parse_or("REDIS_RESPONSE_TIMEOUT_MS", 2_000)?),
        };

        let api_timeout_ms: u64 = parse_or("API_TIMEOUT_MS", 10_000)?;
        if api_timeout_ms == 0 {
            bail!("API_TIMEOUT_MS phải > 0");
        }

        let room = RoomSettings {
            capacity: parse_or("ROOM_CAPACITY", 500)?,
            queue_max: parse_or("QUEUE_MAX", 3000)?,
            tick_ms: parse_or("ROOM_TICK_MS", 100)?,
            admit_per_sec: parse_or("ADMIT_PER_SEC", 20)?,
            chat_flush_ms: parse_or("CHAT_FLUSH_MS", 250)?,
            chat_max_per_sec: parse_or("CHAT_MAX_PER_SEC", 20)?,
            bots: parse_or("ROOM_BOTS", 15)?,
            reconnect_hold_ms: scaled("RECONNECT_HOLD_SECS", 30, 1000)?,
            chat_blacklist_file: env::var("CHAT_BLACKLIST_FILE")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            talk: {
                let d = crate::game::room::TalkConfig::DEFAULT;
                crate::game::room::TalkConfig {
                    invite_ms: parse_or("TALK_INVITE_MS", d.invite_ms)?,
                    ask_gap_ms: parse_or("TALK_ASK_GAP_MS", d.ask_gap_ms)?,
                    decline_cooldown_ms: parse_or(
                        "TALK_DECLINE_COOLDOWN_MS",
                        d.decline_cooldown_ms,
                    )?,
                    idle_ms: parse_or("TALK_IDLE_MS", d.idle_ms)?,
                    dm_min_gap_ms: parse_or("TALK_DM_MIN_GAP_MS", d.dm_min_gap_ms)?,
                }
            },
        };
        if room.capacity == 0 || room.capacity > u16::MAX as usize {
            bail!("ROOM_CAPACITY phải trong 1..=65535");
        }
        if room.tick_ms == 0 || room.admit_per_sec == 0 {
            bail!("ROOM_TICK_MS và ADMIT_PER_SEC phải > 0");
        }
        if room.bots >= room.capacity {
            bail!("ROOM_BOTS phải nhỏ hơn ROOM_CAPACITY");
        }
        if room.chat_flush_ms == 0 || room.chat_max_per_sec == 0 {
            bail!("CHAT_FLUSH_MS và CHAT_MAX_PER_SEC phải > 0");
        }
        if !(3_000..=120_000).contains(&room.talk.invite_ms) {
            bail!("TALK_INVITE_MS phải trong 3000..=120000");
        }
        if room.talk.idle_ms < 60_000 {
            bail!("TALK_IDLE_MS phải ≥ 60000 (1 phút)");
        }

        if !(5_000..=300_000).contains(&room.reconnect_hold_ms) {
            bail!("RECONNECT_HOLD_SECS phải trong 5..=300");
        }

        let app_env = env::var("APP_ENV").unwrap_or_else(|_| "development".into());
        let production = app_env == "production";
        let cors_allow_origins =
            parse_origins(&env::var("CORS_ALLOW_ORIGINS").unwrap_or_default())?;
        if production && cors_allow_origins.is_empty() {
            bail!(
                "APP_ENV=production thì CORS_ALLOW_ORIGINS phải có danh sách origin cụ thể (không rỗng, không *)"
            );
        }
        let guest = GuestSettings {
            ttl: Duration::from_secs(scaled("GUEST_TTL_DAYS", 14, 86_400)?),
            cookie_max_age: Duration::from_secs(scaled("GUEST_COOKIE_DAYS", 14, 86_400)?),
            cookie_secure: production,
            create_per_min: parse_or("GUEST_CREATE_PER_MIN", 2000)?,
        };
        if guest.ttl.is_zero() || guest.cookie_max_age.is_zero() {
            bail!("GUEST_TTL_DAYS và GUEST_COOKIE_DAYS phải > 0");
        }
        if guest.cookie_max_age > Duration::from_secs(400 * 86_400) {
            bail!("GUEST_COOKIE_DAYS tối đa 400 (trình duyệt tự kẹp)");
        }
        if guest.cookie_max_age < guest.ttl {
            bail!("GUEST_COOKIE_DAYS phải ≥ GUEST_TTL_DAYS");
        }

        let quiz_cache_secs: u64 = parse_or("QUIZ_CACHE_SECS", 300)?;
        if quiz_cache_secs == 0 {
            bail!("QUIZ_CACHE_SECS phải > 0");
        }

        let telegram = match env::var("TELEGRAM_BOT_TOKEN") {
            Ok(token) if !token.trim().is_empty() => Some(TelegramConfig {
                token: token.trim().to_string(),
                chat_id: parse_or::<i64>("TELEGRAM_CHAT_ID", 0)?,
            }),
            _ => None,
        };
        if telegram.as_ref().is_some_and(|t| t.chat_id == 0) {
            bail!("có TELEGRAM_BOT_TOKEN thì phải có TELEGRAM_CHAT_ID (vd -100…)");
        }

        Ok(Self {
            room,
            telegram,
            quiz_cache_ttl: Duration::from_secs(quiz_cache_secs),
            app_env,
            guest,
            domain: env::var("DOMAIN").unwrap_or_else(|_| "localhost".into()),
            host: env::var("BACKEND_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: parse_or("BACKEND_PORT", 8080)?,
            api_timeout: Duration::from_millis(api_timeout_ms),
            run_migrations: parse_or("RUN_MIGRATIONS", true)?,
            cors_allow_origins,
            database,
            redis,
        })
    }
}

fn parse_origins(raw: &str) -> Result<Vec<String>> {
    let list: Vec<String> = raw
        .split(',')
        .map(|s| s.trim().trim_end_matches('/').to_ascii_lowercase())
        .filter(|s| !s.is_empty())
        .collect();
    if list.iter().any(|o| o == "*") {
        return Ok(vec![]);
    }
    for o in &list {
        let rest = o
            .strip_prefix("https://")
            .or_else(|| o.strip_prefix("http://"))
            .with_context(|| {
                format!("CORS_ALLOW_ORIGINS: `{o}` phải bắt đầu bằng http:// hoặc https://")
            })?;
        if rest.is_empty() || rest.contains('/') {
            bail!("CORS_ALLOW_ORIGINS: `{o}` phải có dạng scheme://host[:port] (không có path)");
        }
    }
    Ok(list)
}

fn scaled(key: &str, default: u64, unit: u64) -> Result<u64> {
    parse_or::<u64>(key, default)?
        .checked_mul(unit)
        .with_context(|| format!("biến `{key}` quá lớn"))
}

fn required(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("thiếu biến môi trường bắt buộc `{key}`"))
}

fn parse_or<T>(key: &str, default: T) -> Result<T>
where
    T: FromStr,
    T::Err: std::fmt::Display,
{
    match env::var(key) {
        Ok(raw) if !raw.trim().is_empty() => raw
            .trim()
            .parse::<T>()
            .map_err(|e| anyhow::anyhow!("biến `{key}` không hợp lệ ({raw:?}): {e}")),
        _ => Ok(default),
    }
}
