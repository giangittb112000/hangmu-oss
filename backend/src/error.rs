use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
#[allow(dead_code)]
pub enum AppError {
    #[error("không tìm thấy")]
    NotFound,
    #[error("{0}")]
    BadRequest(String),
    #[error("dịch vụ tạm thời không sẵn sàng")]
    Unavailable,
    #[error("{0}")]
    TooMany(String),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Redis(#[from] redis::RedisError),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            AppError::TooMany(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::Database(sqlx::Error::PoolTimedOut) => StatusCode::SERVICE_UNAVAILABLE,
            AppError::Database(_) | AppError::Redis(_) | AppError::Internal(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };

        let message = if status.is_server_error() {
            tracing::error!(error = ?self, "request lỗi");
            "lỗi máy chủ".to_string()
        } else {
            self.to_string()
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}

#[allow(dead_code)]
pub type AppResult<T> = Result<T, AppError>;
