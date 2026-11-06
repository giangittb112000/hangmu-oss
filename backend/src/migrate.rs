use std::{collections::HashSet, fs, path::PathBuf};

use anyhow::{Context, Result, bail};
use sqlx::{PgPool, migrate::Migrator};

pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

struct Applied {
    version: i64,
    success: bool,
}

async fn applied(pool: &PgPool) -> Result<Vec<Applied>> {
    let exists: bool =
        sqlx::query_scalar("SELECT to_regclass('public._sqlx_migrations') IS NOT NULL")
            .fetch_one(pool)
            .await?;
    if !exists {
        return Ok(vec![]);
    }
    let rows: Vec<(i64, bool)> =
        sqlx::query_as("SELECT version, success FROM _sqlx_migrations ORDER BY version")
            .fetch_all(pool)
            .await?;
    Ok(rows
        .into_iter()
        .map(|(version, success)| Applied { version, success })
        .collect())
}

fn sources() -> impl Iterator<Item = &'static sqlx::migrate::Migration> {
    MIGRATOR
        .iter()
        .filter(|m| !m.migration_type.is_down_migration())
}

fn label(version: i64, description: &str) -> String {
    format!("{version}_{}", description.replace(' ', "_"))
}

pub async fn run(pool: &PgPool) -> Result<()> {
    let done: HashSet<i64> = applied(pool)
        .await?
        .into_iter()
        .filter(|a| a.success)
        .map(|a| a.version)
        .collect();
    let pending: Vec<_> = sources().filter(|m| !done.contains(&m.version)).collect();

    MIGRATOR
        .run(pool)
        .await
        .context("chạy migration thất bại")?;
    if pending.is_empty() {
        println!("Không có migration nào cần chạy.");
        return Ok(());
    }
    for m in pending {
        println!("  ✔ Migrated  {}", label(m.version, &m.description));
    }
    Ok(())
}

pub async fn status(pool: &PgPool) -> Result<()> {
    let applied = applied(pool).await?;
    let source_versions: HashSet<i64> = sources().map(|m| m.version).collect();

    let mut any = false;
    println!("  {:<10} Migration", "Trạng thái");
    for m in sources() {
        any = true;
        let state = match applied.iter().find(|a| a.version == m.version) {
            Some(a) if a.success => "Ran",
            Some(_) => "Lỗi",
            None => "Pending",
        };
        println!("  {:<10} {}", state, label(m.version, &m.description));
    }
    for a in applied
        .iter()
        .filter(|a| !source_versions.contains(&a.version))
    {
        any = true;
        println!(
            "  {:<10} {} (không còn file trong source)",
            "Missing", a.version
        );
    }
    if !any {
        println!("  (chưa có migration nào — tạo bằng make:migration)");
    }
    Ok(())
}

pub async fn rollback(pool: &PgPool, step: usize) -> Result<()> {
    let mut done: Vec<i64> = applied(pool)
        .await?
        .into_iter()
        .filter(|a| a.success)
        .map(|a| a.version)
        .collect();
    done.sort_unstable_by(|a, b| b.cmp(a));

    if done.is_empty() {
        println!("Không có migration nào để rollback.");
        return Ok(());
    }
    let step = step.max(1);
    let target = done.get(step).copied().unwrap_or(0);
    MIGRATOR
        .undo(pool, target)
        .await
        .context("rollback thất bại (migration có file .down.sql chưa?)")?;

    for v in done.iter().take(step) {
        let desc = sources()
            .find(|m| m.version == *v)
            .map(|m| m.description.to_string())
            .unwrap_or_default();
        println!("  ↩ Rolled back  {}", label(*v, &desc));
    }
    Ok(())
}

pub async fn reset(pool: &PgPool) -> Result<()> {
    let count = applied(pool).await?.iter().filter(|a| a.success).count();
    if count == 0 {
        println!("Không có migration nào để rollback.");
        return Ok(());
    }
    rollback(pool, count).await
}

pub async fn fresh(pool: &PgPool) -> Result<()> {
    sqlx::raw_sql(
        "DROP SCHEMA IF EXISTS public CASCADE; \
         CREATE SCHEMA public AUTHORIZATION CURRENT_USER;",
    )
    .execute(pool)
    .await
    .context("xoá schema public thất bại")?;
    println!("  ✖ Đã xoá toàn bộ bảng trong schema public");
    run(pool).await
}

pub fn make(name: &str) -> Result<()> {
    let name = name.trim().to_lowercase();
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
    {
        bail!("tên migration phải là snake_case (a-z, 0-9, _), vd: create_users_table");
    }

    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
    if !dir.is_dir() {
        bail!(
            "không thấy thư mục {} — make:migration chỉ dùng trong môi trường dev",
            dir.display()
        );
    }

    let version = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let base = format!("{version}_{name}");
    let (up, down) = templates(&name);

    let up_path = dir.join(format!("{base}.up.sql"));
    let down_path = dir.join(format!("{base}.down.sql"));
    if up_path.exists() || down_path.exists() {
        bail!("migration {base} đã tồn tại");
    }
    fs::write(&up_path, up)?;
    fs::write(&down_path, down)?;

    println!("  ✔ Created  migrations/{base}.up.sql");
    println!("  ✔ Created  migrations/{base}.down.sql");
    Ok(())
}

fn templates(name: &str) -> (String, String) {
    if let Some(table) = name
        .strip_prefix("create_")
        .and_then(|s| s.strip_suffix("_table"))
        .filter(|t| !t.is_empty())
    {
        let up = format!(
            "CREATE TABLE IF NOT EXISTS {table} (\n    \
             id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n    \
             created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),\n    \
             updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n"
        );
        let down = format!("DROP TABLE IF EXISTS {table};\n");
        return (up, down);
    }
    (
        format!("-- Migration: {name}\n-- Viết câu lệnh thay đổi schema ở đây.\n"),
        format!("-- Rollback: {name}\n-- Viết câu lệnh hoàn tác (ngược với file .up.sql).\n"),
    )
}
