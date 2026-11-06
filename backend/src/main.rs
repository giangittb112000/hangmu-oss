mod cli;
mod config;
mod db;
mod error;
mod game;
mod guest;
mod migrate;
mod quiz;
mod redis;
mod routes;
mod state;
mod telegram;

use std::{net::SocketAddr, sync::Arc};

use anyhow::{Context, Result, bail};
use clap::Parser;
use tokio::net::TcpListener;
use tracing_subscriber::{EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    cli::{Cli, Command},
    config::Config,
    state::AppState,
};

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();

    let cli = Cli::parse();
    let command = cli.command.unwrap_or(Command::Serve);

    let default_log = if matches!(command, Command::Serve) {
        "info"
    } else {
        "warn"
    };
    let filter = if matches!(command, Command::Serve) {
        EnvFilter::try_from_default_env().unwrap_or_else(|_| default_log.into())
    } else {
        EnvFilter::new(default_log)
    };
    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    if let Command::MakeMigration { name } = &command {
        return migrate::make(name);
    }

    let config = Arc::new(Config::from_env()?);

    match command {
        Command::Serve => serve(config).await,
        Command::Migrate => migrate::run(&db_for_cli(&config).await?).await,
        Command::MigrateStatus => migrate::status(&db_for_cli(&config).await?).await,
        Command::MigrateRollback { step, force } => {
            guard_production(&config, force, "migrate:rollback")?;
            migrate::rollback(&db_for_cli(&config).await?, step).await
        }
        Command::MigrateReset { force } => {
            guard_production(&config, force, "migrate:reset")?;
            migrate::reset(&db_for_cli(&config).await?).await
        }
        Command::MigrateRefresh { force } => {
            guard_production(&config, force, "migrate:refresh")?;
            let pool = db_for_cli(&config).await?;
            migrate::reset(&pool).await?;
            migrate::run(&pool).await
        }
        Command::MigrateFresh { force } => {
            guard_production(&config, force, "migrate:fresh")?;
            migrate::fresh(&db_for_cli(&config).await?).await
        }
        Command::MakeMigration { .. } => unreachable!(),
    }
}

fn guard_production(config: &Config, force: bool, cmd: &str) -> Result<()> {
    if config.app_env == "production" && !force {
        bail!("APP_ENV=production — `{cmd}` có thể làm mất dữ liệu. Thêm --force nếu chắc chắn.");
    }
    Ok(())
}

async fn db_for_cli(config: &Config) -> Result<sqlx::PgPool> {
    let mut cfg = config.database.clone();
    cfg.min_connections = 0;
    cfg.max_connections = 2;
    db::connect(&cfg).await
}

async fn serve(config: Arc<Config>) -> Result<()> {
    tracing::info!(env = %config.app_env, domain = %config.domain, "khởi động hangmu-backend");

    let strict = config.app_env == "production";
    let (db, redis) = if strict {
        tokio::try_join!(db::connect(&config.database), redis::connect(&config.redis))?
    } else {
        tokio::try_join!(
            db::connect_or_lazy(&config.database),
            redis::connect_or_lazy(&config.redis)
        )?
    };
    if config.run_migrations {
        migrate::MIGRATOR
            .run(&db)
            .await
            .context("chạy migration lúc khởi động thất bại")?;
        tracing::info!("migrations OK (RUN_MIGRATIONS=true)");
    }
    let chat_filter =
        game::chat_filter::ChatFilter::load(config.room.chat_blacklist_file.as_deref())?;
    tracing::info!(
        entries = chat_filter.entries(),
        "đã nạp danh sách từ cấm chat"
    );
    let room = game::actor::spawn_room(
        game::room::RoomConfig {
            capacity: config.room.capacity,
            queue_max: config.room.queue_max,
            admit_per_sec: config.room.admit_per_sec,
            tick_hz: game::constants::GAME.server_tick_hz,
            chat_flush_ms: config.room.chat_flush_ms,
            chat_max_per_sec: config.room.chat_max_per_sec,
            chat_filter: std::sync::Arc::new(chat_filter),
            bots: config.room.bots,
            talk: config.room.talk,
            reconnect_hold_ms: config.room.reconnect_hold_ms,
            bot_seed: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(1),
        },
        std::time::Duration::from_millis(config.room.tick_ms),
    );
    if let Some(tg) = config.telegram.clone() {
        tokio::spawn(telegram::run(tg, room.tx.clone()));
    } else {
        tracing::info!("TELEGRAM_BOT_TOKEN trống — tắt thông báo người vào group Telegram");
    }
    let state = AppState {
        config: config.clone(),
        db: db.clone(),
        redis,
        room,
        quiz: Arc::new(quiz::QuizCache::new(config.quiz_cache_ttl)),
    };
    let app = routes::router(state);

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .context("BACKEND_HOST/BACKEND_PORT không hợp lệ")?;
    let listener = TcpListener::bind(addr)
        .await
        .with_context(|| format!("không bind được {addr}"))?;
    tracing::info!(%addr, api_timeout_ms = config.api_timeout.as_millis(), "đang lắng nghe");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    db.close().await;
    tracing::info!("đã tắt");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("không cài được Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("không cài được SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("nhận tín hiệu tắt, đang dừng...");
}
