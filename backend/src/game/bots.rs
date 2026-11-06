use std::f32::consts::TAU;

use super::constants::GAME;
use super::protocol::{MovePayload, q_pos};

const ARENA_RADIUS: f32 = 23.0;
const R_MIN: f32 = ARENA_RADIUS + 1.5;
fn r_max() -> f32 {
    GAME.walk_radius - 1.5
}
const KEEPALIVE_MS: u64 = 1000;

const NAMES: &[&str] = &[
    "Rooney Hà Đông",
    "CR7 Thái Bình",
    "Scholes18",
    "giggs.11",
    "Bruno Fernandes VN",
    "keane16",
    "Vidić Nghệ An",
    "rio5",
    "Solskjaer20",
    "Cantona7",
    "Beckham Phú Thọ",
    "Ruud van Nhà Bè",
    "De Gea Bắc Ninh",
    "evra3",
    "Rashford Q7",
    "Garnacho17",
    "Mainoo37",
    "Park Ji Sung VN",
    "chicharito14",
    "Ronaldo Sài Gòn",
    "Tí Còi",
    "Bin Bùn",
    "Sói già",
    "Mèo ú",
    "Gấu MU",
    "Cu Tèo",
    "kẻ lang thang",
    "Nobita",
    "ông già Old Trafford",
    "Quỷ Lùn",
    "Xoài non",
    "Mít ướt",
    "anh Ba Sài Gòn",
    "Út Nhỏ",
    "Chú Tư fan MU",
    "Bé Na",
    "hoangnam.mu",
    "_tuananh_",
    "mu4ever",
    "manutd_fan_vn",
    "reddevil1878",
    "ggmu_hanoi",
    "quydo_daklak",
    "TrangPhamm",
    "dungg_ng",
    "Lin Lin",
    "thanhtung97",
    "anhkhoa99",
    "ny_k_co",
    "hieu.ggmu",
    "Tuấn Anh",
    "Đức Mạnh",
    "Minh Đức",
    "Phạm Hùng",
    "Quỳnh Anh",
    "Hoàng Long",
    "Thảo My",
    "Đạt Manchester",
    "Long GGMU",
    "Hiếu Quỷ Đỏ",
    "Thịnh 1999",
];

fn number_in_name(name: &str) -> Option<u8> {
    let digits: String = name
        .chars()
        .rev()
        .take_while(char::is_ascii_digit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    if digits.is_empty() || digits.len() > 2 || digits.len() == name.len() {
        return None;
    }
    digits.parse::<u8>().ok().filter(|n| (1..=99).contains(n))
}

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(seed | 1)
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    pub fn f32(&mut self) -> f32 {
        (self.next_u64() >> 40) as f32 / (1u64 << 24) as f32
    }

    pub fn range(&mut self, lo: f32, hi: f32) -> f32 {
        lo + (hi - lo) * self.f32()
    }

    pub fn below(&mut self, n: usize) -> usize {
        (self.next_u64() % n.max(1) as u64) as usize
    }

    pub fn ms(&mut self, lo: u64, hi: u64) -> u64 {
        lo + self.next_u64() % (hi - lo).max(1)
    }

    pub fn pick<'a>(&mut self, list: &'a [&'a str]) -> &'a str {
        list[self.below(list.len())]
    }
}

fn q_dir(idx: u8, mag: u8) -> u8 {
    (mag << 5) | (idx & 31)
}

fn q_heading(rad: f32) -> u8 {
    ((rad / TAU * 256.0).round() as i32).rem_euclid(256) as u8
}

fn seg_min_r(ax: f32, az: f32, bx: f32, bz: f32) -> f32 {
    let (dx, dz) = (bx - ax, bz - az);
    let len2 = dx * dx + dz * dz;
    let t = if len2 < 1e-6 {
        0.0
    } else {
        (-(ax * dx + az * dz) / len2).clamp(0.0, 1.0)
    };
    (ax + dx * t).hypot(az + dz * t)
}

pub fn random_spot(rng: &mut Rng) -> (f32, f32) {
    let a = if rng.f32() < 0.6 {
        rng.range(-1.2, 1.2)
    } else {
        rng.range(0.0, TAU)
    };
    let r = rng.range(R_MIN, r_max());
    (a.sin() * r, a.cos() * r)
}

pub fn random_name(rng: &mut Rng, taken: impl Fn(&str) -> bool) -> String {
    for _ in 0..20 {
        let n = rng.pick(NAMES);
        if !taken(n) {
            return n.to_owned();
        }
    }
    format!("{} {}", rng.pick(NAMES), 2 + rng.below(98))
}

pub fn random_number(rng: &mut Rng, name: &str) -> Option<u8> {
    number_in_name(name).or_else(|| (rng.f32() < 0.8).then(|| 1 + rng.below(99) as u8))
}

enum Phase {
    Idle { until: u64 },
    Walk { vx: f32, vz: f32, left: f32 },
}

pub struct Bot {
    pub index: u16,
    pub x: f32,
    pub z: f32,
    heading: f32,
    dir: u8,
    phase: Phase,
    last_sent: u64,
}

impl Bot {
    pub fn new(index: u16, x: f32, z: f32, rng: &mut Rng, now: u64) -> Self {
        Self {
            index,
            x,
            z,
            heading: rng.range(0.0, TAU),
            dir: 0,
            phase: Phase::Idle {
                until: now + rng.ms(500, 6000),
            },
            last_sent: now,
        }
    }

    pub fn payload(&self) -> MovePayload {
        MovePayload {
            x: q_pos(self.x),
            z: q_pos(self.z),
            heading: q_heading(self.heading),
            dir: self.dir,
        }
    }

    pub fn heading_q(&self) -> u8 {
        q_heading(self.heading)
    }

    fn plan(&mut self, rng: &mut Rng) -> bool {
        for _ in 0..24 {
            let idx = rng.below(32) as u8;
            let mag = 3 + rng.below(3) as u8;
            let a = idx as f32 / 32.0 * TAU;
            let (ux, uz) = (a.sin(), a.cos());
            let dist = rng.range(3.0, 14.0);
            let (ex, ez) = (self.x + ux * dist, self.z + uz * dist);
            let er = ex.hypot(ez);
            if er > r_max() || er < R_MIN || seg_min_r(self.x, self.z, ex, ez) < R_MIN {
                continue;
            }
            let speed = GAME.move_speed * mag as f32 / 7.0;
            self.dir = q_dir(idx, mag);
            self.heading = ux.atan2(uz);
            self.phase = Phase::Walk {
                vx: ux * speed,
                vz: uz * speed,
                left: dist,
            };
            return true;
        }
        false
    }

    pub fn step(&mut self, now: u64, dt: f32, rng: &mut Rng) -> bool {
        match &mut self.phase {
            Phase::Idle { until } => {
                if now < *until {
                    return false;
                }
                if self.plan(rng) {
                    self.last_sent = now;
                    true
                } else {
                    self.phase = Phase::Idle {
                        until: now + rng.ms(1000, 3000),
                    };
                    false
                }
            }
            Phase::Walk { vx, vz, left } => {
                let speed = vx.hypot(*vz);
                let d = (speed * dt).min(*left);
                self.x += *vx / speed * d;
                self.z += *vz / speed * d;
                *left -= d;
                if *left <= 1e-3 {
                    self.dir = 0;
                    self.phase = Phase::Idle {
                        until: now + rng.ms(2000, 10_000),
                    };
                    self.last_sent = now;
                    return true;
                }
                if now.saturating_sub(self.last_sent) >= KEEPALIVE_MS {
                    self.last_sent = now;
                    return true;
                }
                false
            }
        }
    }
}
