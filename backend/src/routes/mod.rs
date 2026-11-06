mod health;
mod me;
mod quiz;
mod room;
mod ws;

use axum::{
    Json, Router,
    http::{HeaderValue, Method, StatusCode, header},
    routing::{get, post},
};
use serde_json::json;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};

use crate::{error::AppError, state::AppState};

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/room/status", get(room::status))
        .route("/quiz", get(quiz::questions))
        .route("/quiz/answer", post(quiz::answer))
        .route("/me", get(me::get).post(me::post))
        .fallback(|| async { AppError::NotFound })
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            state.config.api_timeout,
        ));

    Router::new()
        .nest("/api", api)
        .route("/ws", get(ws::upgrade))
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "không tìm thấy" })),
            )
        })
        .layer(cors(&state.config.cors_allow_origins))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

fn cors(origins: &[String]) -> CorsLayer {
    let allow = if origins.is_empty() {
        AllowOrigin::mirror_request()
    } else {
        AllowOrigin::list(origins.iter().filter_map(|o| HeaderValue::from_str(o).ok()))
    };
    CorsLayer::new()
        .allow_origin(allow)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE, header::ACCEPT, header::IF_NONE_MATCH])
        .allow_credentials(true)
}
