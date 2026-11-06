use std::collections::HashSet;

use anyhow::{Context, Result};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

const BUILTIN: &str = include_str!("chat-blacklist.txt");
const MASK_MAX: usize = 8;

#[derive(Debug, Default)]
pub struct ChatFilter {
    exact: HashSet<String>,
    folded: HashSet<String>,
    max_words: usize,
}

fn exact_key(w: &str) -> String {
    w.nfc()
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric())
        .collect()
}

fn fold_key(w: &str) -> String {
    w.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'đ' => 'd',
            '0' => 'o',
            '1' => 'i',
            '3' => 'e',
            '4' | '@' => 'a',
            '5' | '$' => 's',
            '7' => 't',
            c => c,
        })
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn collapse(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last = None;
    for c in s.chars() {
        if last != Some(c) {
            out.push(c);
        }
        last = Some(c);
    }
    out
}

fn join<'a>(toks: &'a [Token], key: impl Fn(&'a Token) -> &'a str) -> Option<String> {
    let parts: Vec<&str> = toks.iter().map(key).collect();
    (!parts.iter().any(|p| p.is_empty())).then(|| parts.join(" "))
}

struct Token<'a> {
    text: &'a str,
    exact: String,
    exact_col: String,
    fold: String,
    fold_col: String,
}

impl ChatFilter {
    pub fn load(extra_file: Option<&str>) -> Result<Self> {
        let mut f = Self::default();
        f.add_list(BUILTIN);
        if let Some(path) = extra_file {
            let extra = std::fs::read_to_string(path)
                .with_context(|| format!("không đọc được CHAT_BLACKLIST_FILE={path}"))?;
            f.add_list(&extra);
        }
        Ok(f)
    }

    pub fn entries(&self) -> usize {
        self.exact.len() + self.folded.len()
    }

    fn add_list(&mut self, list: &str) {
        for line in list.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let words: Vec<&str> = line.split_whitespace().collect();
            self.max_words = self.max_words.max(words.len());
            if line.is_ascii() {
                let key: Vec<String> = words.iter().map(|w| fold_key(w)).collect();
                self.folded.insert(key.join(" "));
            } else {
                let key: Vec<String> = words.iter().map(|w| exact_key(w)).collect();
                self.exact.insert(key.join(" "));
            }
        }
    }

    fn hit(&self, toks: &[Token]) -> bool {
        let in_set = |set: &HashSet<String>, k: Option<String>| k.is_some_and(|k| set.contains(&k));
        in_set(&self.exact, join(toks, |t| &t.exact))
            || in_set(&self.exact, join(toks, |t| &t.exact_col))
            || in_set(&self.folded, join(toks, |t| &t.fold))
            || in_set(&self.folded, join(toks, |t| &t.fold_col))
    }

    pub fn clean(&self, text: &str) -> String {
        let toks: Vec<Token> = text
            .split(' ')
            .map(|w| {
                let exact = exact_key(w);
                let fold = fold_key(w);
                Token {
                    text: w,
                    exact_col: collapse(&exact),
                    fold_col: collapse(&fold),
                    exact,
                    fold,
                }
            })
            .collect();
        let mut masked = vec![false; toks.len()];
        for i in 0..toks.len() {
            for n in (1..=self.max_words.min(toks.len() - i)).rev() {
                if self.hit(&toks[i..i + n]) {
                    masked[i..i + n].iter_mut().for_each(|m| *m = true);
                    break;
                }
            }
        }
        if !masked.contains(&true) {
            return text.to_owned();
        }
        toks.iter()
            .zip(&masked)
            .map(|(t, &m)| {
                if m {
                    "*".repeat(t.text.chars().count().clamp(3, MASK_MAX))
                } else {
                    t.text.to_owned()
                }
            })
            .collect::<Vec<_>>()
            .join(" ")
    }
}
