use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "hangmu-backend", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Option<Command>,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Serve,

    #[command(name = "migrate")]
    Migrate,

    #[command(name = "migrate:status")]
    MigrateStatus,

    #[command(name = "migrate:rollback")]
    MigrateRollback {
        #[arg(long, default_value_t = 1)]
        step: usize,
        #[arg(long)]
        force: bool,
    },

    #[command(name = "migrate:reset")]
    MigrateReset {
        #[arg(long)]
        force: bool,
    },

    #[command(name = "migrate:refresh")]
    MigrateRefresh {
        #[arg(long)]
        force: bool,
    },

    #[command(name = "migrate:fresh")]
    MigrateFresh {
        #[arg(long)]
        force: bool,
    },

    #[command(name = "make:migration")]
    MakeMigration {
        name: String,
    },
}
