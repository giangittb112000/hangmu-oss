use axum::{Json, extract::State, http::header, response::IntoResponse};

use crate::state::AppState;

pub async fn status(State(state): State<AppState>) -> impl IntoResponse {
    let s = state.room.status.borrow().clone();
    ([(header::CACHE_CONTROL, "public, max-age=2")], Json(s))
}
