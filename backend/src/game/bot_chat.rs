use std::collections::VecDeque;
use std::hash::{DefaultHasher, Hash, Hasher};

use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

use super::bots::Rng;

const SOLO: &[&str] = &[
    "alo alo",
    "ae đâu hết rồi",
    "đông thế",
    "=))",
    "đói quá",
    "ai đi ăn k",
    "buồn ngủ vãi",
    "mạng lag quá trời",
    "lửa to phết",
    "ai vừa đi xuyên qua người mình đấy 😤",
    "hang rộng thật",
    "chán quá ai nói gì đi",
    "hello hang",
    "lại là mình đây",
    "ggmu",
    "GGMU 🔴",
    "điểm danh",
    "hôm nay ai thua kèo đấy",
    "đội nhà làm khổ quá ae ơi",
    "thôi đi ngủ đây... đùa đấy",
    "trốn sếp vào hang tí",
    "vợ gọi rồi, tí vào lại",
    "có ai k",
    "huhu",
    "năm sau là năm của chúng ta =))",
    "xem MU đá tăng xông thật sự",
    "ai đứng giữa đấu trường thế kia",
    "mình đứng cạnh bảng tin nè",
    "bấm G ăn mừng đi ae, buồn quá",
    "lạnh, ra gần lửa tí",
    "fan MU từ trong bụng mẹ đây",
    "thua thì vào hang, thắng thì ra hang =))",
    "trọng tài lại thổi ép cho xem",
    "MU dẫn 1-0 là mình bắt đầu run",
    "đang họp mà lén vào đây",
    "ở cùng phòng với fan Liverpool khổ lắm ae",
    "Fergie time đâu rồi huhu",
    "đi vòng vòng cho đỡ buồn chân",
    "mua áo đấu xong đội thua luôn, xui",
    "hứa bỏ xem MU 10 lần rồi =))",
    "đêm nào MU đá cũng thành cú đêm",
    "ai bật nhạc lên đi",
    "ae nhảy lên tí cho vui",
    "nay hang vắng nhỉ",
    "ủa sao im thế",
    "mình vừa vấp ghế đá đau quá =))",
    "ai mở cái màn hình to to kia thế",
    "thắng thì nhờ HLV, thua thì tại trọng tài =))",
    "mì tôm đây, ai ăn k",
    "đứng im lâu là thành tượng đấy",
    "kèo này mà thắng mình cạo đầu",
    "chiến thôi ae",
    "tí xem trận k ae",
    "ae ở đâu, mình HN",
    "SG điểm danh",
    "trời ơi lại lag",
];

const TEASES: &[&str] = &[
    "{x} đứng im thế, lag à =))",
    "{x} đi đâu đấy",
    "{x} nói gì đi chứ",
    "{x} nhìn như fan City trá hình 👀",
    "ê {x} áo số mấy đấy",
    "{x} lại vào hang à, thua kèo nữa hả =))",
    "{x} chạy lòng vòng chóng mặt quá",
    "{x} ơi bao trà đá đi",
    "ai cho {x} vào hang thế =))",
    "{x} im lặng là vàng à",
    "{x} hôm qua thua kèo chưa trả đấy nhé",
    "{x} đứng gần lửa thế cháy áo bây giờ",
    "nhìn {x} đi như đang tìm wifi =))",
    "{x} ơi đứng xa ra tí, chật",
    "{x} vào muộn thế",
    "hello {x} 👋",
];

type Dialogue = &'static [(u8, &'static str)];
const DIALOGUES: &[Dialogue] = &[
    &[
        (0, "{b} đứng im cả buổi, ngủ gật à"),
        (1, "đang suy ngẫm về đời fan MU"),
        (0, "thế ngủ luôn đi =))"),
    ],
    &[
        (0, "ê {b} áo số mấy thế"),
        (1, "số đẹp, hỏi làm gì"),
        (2, "chắc số 0 =))"),
    ],
    &[
        (0, "{b} fan City trá hình đúng k"),
        (1, "vu khống 😤"),
        (0, "nhìn mặt là biết"),
    ],
    &[
        (0, "ai vừa bấm ăn mừng đấy"),
        (1, "tay mình trượt =))"),
        (0, "trượt như hàng thủ nhà mình"),
    ],
    &[
        (0, "{b} ơi cho mượn 50k"),
        (1, "vào hang còn vay tiền à"),
        (2, "hang k có ATM đâu =))"),
    ],
    &[
        (0, "đói quá"),
        (1, "ăn nỗi buồn đi"),
        (0, "ăn mãi rồi, ngán"),
    ],
    &[
        (0, "{b} đi đâu mà chạy như ma đuổi thế"),
        (1, "tìm wifi =))"),
    ],
    &[
        (0, "tối nay ai trực"),
        (1, "mình, vợ đi vắng"),
        (2, "{b} lộ hàng rồi =))"),
    ],
    &[
        (0, "{b} hát Glory Glory đi"),
        (1, "mình hát là cả hang chạy hết"),
        (0, "thôi khỏi =))"),
    ],
    &[
        (0, "mạng lag quá trời"),
        (1, "lag như hàng công nhà mình"),
        (2, "đau nhưng đúng"),
    ],
    &[
        (0, "{b} ơi đứng xa lửa ra cháy râu bây giờ"),
        (1, "râu đâu mà cháy"),
        (0, "=))"),
    ],
    &[
        (0, "ae ơi"),
        (1, "gì"),
        (0, "k có gì, gọi cho vui"),
        (1, "😑"),
    ],
    &[
        (0, "ai thua kèo nhớ bao trà đá nha"),
        (1, "mình nhớ mà mình k trả =))"),
    ],
    &[
        (0, "{b} đổi tên đi, nghe như fan Chelsea"),
        (1, "tên đẹp thế còn chê"),
        (2, "đẹp chỗ nào =))"),
    ],
    &[
        (0, "trận tới 3-0 nhé"),
        (1, "lần nào {a} cũng 3-0"),
        (2, "3-0 cho đội kia à =))"),
    ],
    &[
        (0, "{b} vào hang lâu chưa"),
        (1, "từ hồi MU còn vô địch"),
        (0, "ối dồi ôi lâu thế"),
    ],
    &[(0, "ai cho xin cái ghế"), (1, "ngồi đất cho thấm nỗi đau")],
    &[
        (0, "MU thắng là mình chạy 10 vòng quanh lửa"),
        (1, "chạy đi, ae quay video"),
        (0, "chờ thắng đã =))"),
    ],
    &[
        (0, "{b} có người yêu chưa"),
        (1, "có MU là đủ rồi"),
        (2, "thảo nào ế =))"),
    ],
    &[
        (0, "{b} lại đứng chắn đường"),
        (1, "đường này của mình"),
        (0, "hang của chung nhé ông"),
    ],
    &[
        (0, "nay ai mặc áo đẹp nhất hang"),
        (1, "mình chứ ai"),
        (2, "{b} tự tin quá =))"),
    ],
    &[
        (0, "{b} ơi chuyền bóng như MU đi"),
        (1, "chuyền ngang chuyền về à"),
        (0, "chuẩn =))"),
    ],
];

const GREETINGS: &[&str] = &[
    "chào {name} 👋",
    "{name} vào rồi kìa ae",
    "hello {name}",
    "ê {name}",
    "{name} ơi ra lửa ngồi này",
    "{name} mang mì tôm chưa =))",
    "lại thêm một nạn nhân của MU 😂 chào {name}",
];

const REACTIONS: &[(&[&str], f32, &[&str])] = &[
    (
        &["chao", "hello", "hi", "alo", "helo", "xin chao"],
        0.7,
        &[
            "chào {name} 👋",
            "hello {name}",
            "{name} ơi chào nè",
            "ê {name}, ra lửa ngồi cho ấm",
        ],
    ),
    (
        &[
            "ggmu",
            "glory",
            "man united",
            "manchester united",
            "red devil",
            "quy do",
        ],
        0.65,
        &[
            "GGMU!!! 🔴",
            "glory glory 🎶",
            "{name} chuẩn fan",
            "hô to lên {name}",
        ],
    ),
    (
        &["city", "liverpool", "chelsea", "arsenal", "tottenham"],
        0.6,
        &[
            "{name} nhắc đội đó làm gì, súc miệng đi =))",
            "cấm nhắc tên đội khác trong hang nha {name} 😤",
            "{name} gián điệp à 👀",
            "nghe tên là lửa trại tắt một nửa =))",
        ],
    ),
    (
        &["thua", "toang", "buon", "chan"],
        0.55,
        &[
            "{name} đừng nói gở 😤",
            "thua thì ở hang với ae, có gì đâu",
            "buồn thì ra lửa ngồi {name} ơi",
            "quen rồi {name} ạ =))",
        ],
    ),
    (
        &["thang", "vo dich", "win", "3-0", "2-0"],
        0.55,
        &[
            "{name} lạc quan ghê =))",
            "thắng là ra hang ăn mừng nha {name}",
            "nói thế thôi chứ mình vẫn run",
            "{name} nói gì cũng được trừ chữ đó, xui =))",
        ],
    ),
    (
        &["haha", "=))", "kkk", "😂", "hihi", ":))", "lol"],
        0.4,
        &["=)))", "cười gì đấy {name}", "😂😂", "{name} vui ghê"],
    ),
    (
        &["?"],
        0.45,
        &[
            "ai biết đâu =))",
            "chịu {name} ơi",
            "hỏi khó thế",
            "google đi {name}",
            "{name} hỏi câu này là lộ fan mới rồi =))",
        ],
    ),
];
const GENERIC: &[&str] = &[
    "chuẩn {name}",
    "+1",
    "{name} nói chí phải",
    "ủa {name} nói gì thế, lag à =))",
    "đồng ý với {name}",
    "{name} nói hay đấy, ai cho {name} nói thế =))",
    "ừ",
];
const GENERIC_CHANCE: f32 = 0.15;
const TAILS: &[&str] = &[" =))", " 😂", " kkk", " :))", " haha"];

pub struct Planned {
    pub at: u64,
    pub speaker: Option<u16>,
    pub text: String,
    pub can_vote: bool,
}

pub struct BotChat {
    queue: Vec<Planned>,
    recent: VecDeque<u64>,
    next_topic: u64,
    last_react: u64,
}

const RECENT: usize = 60;
const TOPIC_MS: (u64, u64) = (15_000, 45_000);
const REACT_COOLDOWN_MS: u64 = 6000;

fn fold(s: &str) -> String {
    s.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .map(|c| if c == 'đ' { 'd' } else { c })
        .collect()
}

fn fingerprint(s: &str) -> u64 {
    let mut h = DefaultHasher::new();
    fold(s).hash(&mut h);
    h.finish()
}

impl BotChat {
    pub fn new() -> Self {
        Self {
            queue: Vec::new(),
            recent: VecDeque::with_capacity(RECENT),
            next_topic: 0,
            last_react: 0,
        }
    }

    pub fn reset(&mut self) {
        self.queue.clear();
        self.next_topic = 0;
    }

    fn seen(&self, s: &str) -> bool {
        self.recent.contains(&fingerprint(s))
    }

    fn remember(&mut self, s: &str) {
        let f = fingerprint(s);
        self.recent.retain(|r| *r != f);
        if self.recent.len() == RECENT {
            self.recent.pop_front();
        }
        self.recent.push_back(f);
    }

    fn least_recent<T: Copy>(
        &self,
        rng: &mut Rng,
        items: &[T],
        key: impl Fn(T) -> &'static str,
    ) -> T {
        let age = |t: T| {
            let f = fingerprint(key(t));
            self.recent.iter().position(|r| *r == f)
        };
        let unseen: Vec<T> = items
            .iter()
            .copied()
            .filter(|t| age(*t).is_none())
            .collect();
        if !unseen.is_empty() {
            return unseen[rng.below(unseen.len())];
        }
        *items
            .iter()
            .min_by_key(|t| age(**t).unwrap_or(0))
            .expect("danh sách không rỗng")
    }

    fn fresh(&mut self, rng: &mut Rng, mut make: impl FnMut(&mut Rng) -> String) -> String {
        let mut s = make(rng);
        for _ in 0..12 {
            if !self.seen(&s) {
                break;
            }
            s = make(rng);
        }
        self.remember(&s);
        s
    }

    fn style(rng: &mut Rng, s: String) -> String {
        let mut s = s;
        if rng.f32() < 0.12 {
            s = s.to_lowercase();
        }
        let ends_plain = s.chars().last().is_some_and(|c| c.is_alphanumeric());
        if ends_plain && rng.f32() < 0.2 {
            s.push_str(rng.pick(TAILS));
        }
        s
    }

    fn push(&mut self, at: u64, speaker: Option<u16>, text: String, can_vote: bool) {
        self.queue.push(Planned {
            at,
            speaker,
            text,
            can_vote,
        });
    }

    pub fn plan(
        &mut self,
        now: u64,
        rng: &mut Rng,
        bots: &[u16],
        name_of: impl Fn(u16) -> String,
        humans: impl FnOnce() -> Vec<String>,
    ) {
        if bots.is_empty() {
            return;
        }
        if self.next_topic == 0 {
            self.next_topic = now + rng.ms(4000, 10_000);
            return;
        }
        if now < self.next_topic {
            return;
        }
        self.next_topic = now + rng.ms(TOPIC_MS.0, TOPIC_MS.1);
        let roll = rng.f32();
        if roll < 0.35 && bots.len() >= 3 {
            self.plan_dialogue(now, rng, bots, name_of);
        } else if roll < 0.6 {
            let humans = humans();
            let speaker = bots[rng.below(bots.len())];
            let target = if !humans.is_empty() && rng.f32() < 0.5 {
                humans[rng.below(humans.len())].clone()
            } else {
                let others: Vec<u16> = bots.iter().copied().filter(|b| *b != speaker).collect();
                if others.is_empty() {
                    return;
                }
                name_of(others[rng.below(others.len())])
            };
            let tpl = self.least_recent(rng, TEASES, |s| s);
            self.remember(tpl);
            let line = Self::style(rng, tpl.replace("{x}", &target));
            self.push(now, Some(speaker), line, false);
        } else {
            let line = self.least_recent(rng, SOLO, |s| s).to_owned();
            self.remember(&line);
            let line = Self::style(rng, line);
            self.push(now, None, line, true);
        }
    }

    fn plan_dialogue(
        &mut self,
        now: u64,
        rng: &mut Rng,
        bots: &[u16],
        name_of: impl Fn(u16) -> String,
    ) {
        let dialogue = self.least_recent(rng, DIALOGUES, |d| d[0].1);
        self.remember(dialogue[0].1);
        let mut cast: Vec<u16> = Vec::with_capacity(3);
        while cast.len() < 3 {
            let b = bots[rng.below(bots.len())];
            if !cast.contains(&b) {
                cast.push(b);
            }
        }
        let names: Vec<String> = cast.iter().map(|&b| name_of(b)).collect();
        let mut at = now;
        for &(role, text) in dialogue {
            let line = text
                .replace("{a}", &names[0])
                .replace("{b}", &names[1])
                .replace("{c}", &names[2]);
            self.push(at, Some(cast[role as usize]), line, false);
            at += rng.ms(3000, 8000);
        }
        self.next_topic = self.next_topic.max(at + rng.ms(5000, 15_000));
    }

    pub fn greet(&mut self, now: u64, rng: &mut Rng, name: &str) {
        if rng.f32() < 0.45 {
            let line = rng.pick(GREETINGS).replace("{name}", name);
            let line = Self::style(rng, line);
            self.push(now + rng.ms(2000, 5000), None, line, false);
        }
    }

    pub fn react(&mut self, now: u64, rng: &mut Rng, name: &str, text: &str) {
        if now.saturating_sub(self.last_react) < REACT_COOLDOWN_MS {
            return;
        }
        let folded = fold(text);
        let words: Vec<&str> = folded
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty())
            .collect();
        let hit = |k: &str| {
            if k.chars().all(char::is_alphanumeric) {
                words.contains(&k)
            } else {
                folded.contains(k)
            }
        };
        let (chance, pool) = REACTIONS
            .iter()
            .find(|(keys, _, _)| keys.iter().any(|k| hit(k)))
            .map(|(_, p, lines)| (*p, *lines))
            .unwrap_or((GENERIC_CHANCE, GENERIC));
        if rng.f32() >= chance {
            return;
        }
        self.last_react = now;
        let line = self.fresh(rng, |r| r.pick(pool).replace("{name}", name));
        let line = Self::style(rng, line);
        self.push(now + rng.ms(2000, 6000), None, line, false);
    }

    pub fn due(&mut self, now: u64) -> Vec<Planned> {
        let mut out = Vec::new();
        let mut k = 0;
        while k < self.queue.len() {
            if self.queue[k].at <= now {
                out.push(self.queue.swap_remove(k));
            } else {
                k += 1;
            }
        }
        out.sort_by_key(|p| p.at);
        out
    }
}
