use std::sync::LazyLock;

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConstants {
    pub move_speed: f32,
    pub player_radius: f32,
    pub walk_radius: f32,
    pub fire_radius: f32,
    pub spawn_x: f32,
    pub spawn_z: f32,
    pub pos_scale: f32,
    pub dir_steps: u32,
    pub dir_mag_steps: u32,
    pub server_tick_hz: u32,
    pub chat_max_chars: usize,
    pub chat_min_interval_ms: u64,
    pub punch_range: f32,
    pub punch_cooldown_ms: u64,
    pub punch_immune_ms: u64,
    pub talk_range: f32,
}

pub static GAME: LazyLock<GameConstants> = LazyLock::new(|| {
    serde_json::from_str(include_str!("game-constants.json"))
        .expect("game-constants.json không hợp lệ")
});
