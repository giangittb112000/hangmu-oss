use anyhow::{Context, Result};
use redis::aio::{ConnectionManager, ConnectionManagerConfig};

use crate::config::RedisConfig;

fn manager_config(cfg: &RedisConfig) -> ConnectionManagerConfig {
    ConnectionManagerConfig::new()
        .set_connection_timeout(Some(cfg.connect_timeout))
        .set_response_timeout(Some(cfg.response_timeout))
        .set_number_of_retries(1)
        .set_max_delay(std::time::Duration::from_millis(500))
}

pub async fn connect(cfg: &RedisConfig) -> Result<ConnectionManager> {
    let client = redis::Client::open(cfg.url.as_str()).context("REDIS_URL không hợp lệ")?;
    let conn = client
        .get_connection_manager_with_config(manager_config(cfg))
        .await
        .context("không kết nối được Redis (kiểm tra REDIS_URL)")?;

    tracing::info!("Redis sẵn sàng");
    Ok(conn)
}

pub async fn connect_or_lazy(cfg: &RedisConfig) -> Result<ConnectionManager> {
    match connect(cfg).await {
        Ok(conn) => Ok(conn),
        Err(err) => {
            tracing::warn!(error = %format!("{err:#}"), "Redis chưa sẵn sàng — chạy tiếp với kết nối lazy");
            let client = redis::Client::open(cfg.url.as_str()).context("REDIS_URL không hợp lệ")?;
            ConnectionManager::new_lazy_with_config(client, manager_config(cfg))
                .context("không tạo được Redis connection manager")
        }
    }
}
