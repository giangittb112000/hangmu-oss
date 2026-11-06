use anyhow::{Context, Result};
use sqlx::{
    PgPool,
    postgres::{PgConnectOptions, PgPoolOptions},
};

use crate::config::DatabaseConfig;

fn pool_options(cfg: &DatabaseConfig) -> PgPoolOptions {
    PgPoolOptions::new()
        .max_connections(cfg.max_connections)
        .min_connections(cfg.min_connections)
        .acquire_timeout(cfg.acquire_timeout)
        .idle_timeout(cfg.idle_timeout)
        .max_lifetime(cfg.max_lifetime)
}

pub async fn connect(cfg: &DatabaseConfig) -> Result<PgPool> {
    let pool = pool_options(cfg)
        .connect(&cfg.url)
        .await
        .context("không kết nối được PostgreSQL (kiểm tra DATABASE_URL)")?;

    tracing::info!(
        max = cfg.max_connections,
        min = cfg.min_connections,
        "PostgreSQL pool sẵn sàng"
    );
    Ok(pool)
}

pub async fn connect_or_lazy(cfg: &DatabaseConfig) -> Result<PgPool> {
    match connect(cfg).await {
        Ok(pool) => Ok(pool),
        Err(err) => {
            tracing::warn!(error = %format!("{err:#}"), "PostgreSQL chưa sẵn sàng — chạy tiếp với pool lazy");
            let opts: PgConnectOptions = cfg.url.parse().context("DATABASE_URL không hợp lệ")?;
            Ok(pool_options(cfg).min_connections(0).connect_lazy_with(opts))
        }
    }
}
