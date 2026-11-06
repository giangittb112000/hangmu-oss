use std::sync::Arc;

use redis::aio::ConnectionManager;
use sqlx::PgPool;

use crate::{config::Config, game::actor::RoomHandle, quiz::QuizCache};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: PgPool,
    pub redis: ConnectionManager,
    pub room: RoomHandle,
    pub quiz: Arc<QuizCache>,
}
