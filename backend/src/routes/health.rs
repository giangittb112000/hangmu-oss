use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct Health {
    status: &'static str,
    env: String,
    database: Check,
    redis: Check,
    api_timeout_ms: u128,
}

#[derive(Serialize)]
struct Check {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pool_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pool_idle: Option<usize>,
}

impl Check {
    fn failed(e: impl std::fmt::Display) -> Self {
        Self {
            ok: false,
            error: Some(e.to_string()),
            pool_size: None,
            pool_idle: None,
        }
    }
}

pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let mut conn = state.redis.clone();
    let ping = redis::cmd("PING");
    let (db_res, redis_res) = tokio::join!(
        sqlx::query_scalar::<_, i32>("SELECT 1").fetch_one(&state.db),
        ping.query_async::<String>(&mut conn),
    );

    let db = match db_res {
        Ok(_) => Check {
            ok: true,
            error: None,
            pool_size: Some(state.db.size()),
            pool_idle: Some(state.db.num_idle()),
        },
        Err(e) => Check::failed(e),
    };
    let redis = match redis_res {
        Ok(_) => Check {
            ok: true,
            error: None,
            pool_size: None,
            pool_idle: None,
        },
        Err(e) => Check::failed(e),
    };

    let healthy = db.ok && redis.ok;
    let body = Health {
        status: if healthy { "ok" } else { "degraded" },
        env: state.config.app_env.clone(),
        database: db,
        redis,
        api_timeout_ms: state.config.api_timeout.as_millis(),
    };
    let code = if healthy {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (code, Json(body))
}
