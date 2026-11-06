use axum::{
    Json,
    extract::State,
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    error::AppError,
    game::room::{sanitize_name, sanitize_number},
    guest::{self, Guest},
    state::AppState,
};

fn me_json(g: &Guest) -> serde_json::Value {
    json!({ "name": g.name, "number": g.number })
}

fn unavailable(e: redis::RedisError) -> AppError {
    tracing::warn!(error = %e, "guest: Redis lỗi");
    AppError::Unavailable
}

fn reply(body: serde_json::Value, cookie: Option<HeaderValue>) -> Response {
    let mut res = (
        [(header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(body),
    )
        .into_response();
    if let Some(c) = cookie {
        res.headers_mut().insert(header::SET_COOKIE, c);
    }
    res
}

pub async fn get(State(st): State<AppState>, headers: HeaderMap) -> Response {
    let cfg = &st.config.guest;
    let Some(token) = guest::read_cookie(&headers) else {
        return reply(serde_json::Value::Null, None);
    };
    match guest::peek(&st.redis, &token).await {
        Ok(Some(g)) => reply(
            me_json(&g),
            Some(guest::set_cookie(
                &token,
                cfg.cookie_max_age,
                cfg.cookie_secure,
            )),
        ),
        Ok(None) => reply(
            serde_json::Value::Null,
            Some(guest::clear_cookie(cfg.cookie_secure)),
        ),
        Err(e) => {
            tracing::warn!(error = %e, "guest: Redis lỗi khi đọc /api/me");
            reply(serde_json::Value::Null, None)
        }
    }
}

#[derive(Deserialize)]
pub struct MeReq {
    name: String,
    #[serde(default)]
    number: Option<i64>,
}

pub async fn post(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<MeReq>,
) -> Result<Response, AppError> {
    let cfg = &st.config.guest;
    let name = sanitize_name(&req.name)
        .ok_or_else(|| AppError::BadRequest("Tên không hợp lệ (1–30 ký tự).".into()))?;
    let number = sanitize_number(req.number);

    if let Some(token) = guest::read_cookie(&headers)
        && let Some(cur) = guest::peek(&st.redis, &token).await.map_err(unavailable)?
    {
        let refresh = guest::set_cookie(&token, cfg.cookie_max_age, cfg.cookie_secure);
        if cur.name == name && cur.number == number {
            return Ok(reply(me_json(&cur), Some(refresh)));
        }
        if !guest::allow_rename(&st.redis, cur.uid)
            .await
            .map_err(unavailable)?
        {
            return Err(AppError::TooMany(
                "Đổi tên nhiều quá, thử lại sau ít phút.".into(),
            ));
        }
        if let Some(g) = guest::rename(&st.redis, &token, name.clone(), number)
            .await
            .map_err(unavailable)?
        {
            return Ok(reply(me_json(&g), Some(refresh)));
        }
    }

    if !guest::allow_create(&st.redis, cfg)
        .await
        .map_err(unavailable)?
    {
        return Err(AppError::TooMany(
            "Tạo tài khoản nhiều quá, thử lại sau.".into(),
        ));
    }
    let (token, g) = guest::create(&st.redis, name, number, cfg.ttl)
        .await
        .map_err(unavailable)?;
    tracing::info!("guest: tạo tài khoản khách mới");
    Ok(reply(
        me_json(&g),
        Some(guest::set_cookie(
            &token,
            cfg.cookie_max_age,
            cfg.cookie_secure,
        )),
    ))
}
