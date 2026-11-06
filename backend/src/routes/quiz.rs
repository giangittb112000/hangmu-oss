use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};

use crate::{error::AppError, quiz::etag_matches, state::AppState};

pub async fn questions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let (json, etag) = state.quiz.public(&state.db, &state.redis).await?;
    let cache = format!("public, max-age={}", state.quiz.ttl().as_secs());
    let fresh = headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| etag_matches(v, &etag));
    let head = [(header::CACHE_CONTROL, cache), (header::ETAG, etag)];
    Ok(if fresh {
        (StatusCode::NOT_MODIFIED, head).into_response()
    } else {
        (head, [(header::CONTENT_TYPE, "application/json")], json).into_response()
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerReq {
    question_id: i64,
    answer_id: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerRes {
    correct: bool,
    correct_answer_id: i64,
}

pub async fn answer(
    State(state): State<AppState>,
    Json(req): Json<AnswerReq>,
) -> Result<impl IntoResponse, AppError> {
    let correct = state
        .quiz
        .correct_answer(&state.db, &state.redis, req.question_id)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(AnswerRes {
            correct: correct == req.answer_id,
            correct_answer_id: correct,
        }),
    ))
}
