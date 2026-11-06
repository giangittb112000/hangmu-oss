use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use redis::{AsyncCommands, aio::ConnectionManager};
use serde::Serialize;
use sqlx::PgPool;
use tokio::sync::Mutex;

use crate::error::AppError;

const KEY: &str = "hangmu:quiz";
const FAIL_BACKOFF: Duration = Duration::from_secs(3);
const MIN_ANSWERS: usize = 2;
const MAX_ANSWERS: usize = 6;

#[derive(Serialize)]
struct PublicAnswer {
    id: i64,
    text: String,
}

#[derive(Serialize)]
struct PublicQuestion {
    id: i64,
    q: String,
    answers: Vec<PublicAnswer>,
}

#[derive(Serialize)]
struct PublicBank<'a> {
    questions: &'a [PublicQuestion],
}

pub struct Bank {
    pub json: String,
    pub etag: String,
    correct: HashMap<i64, i64>,
}

#[derive(Default)]
struct Reload {
    local: Option<(Instant, Arc<Bank>)>,
    failed_at: Option<Instant>,
}

pub struct QuizCache {
    ttl: Duration,
    reload: Mutex<Reload>,
}

impl QuizCache {
    pub fn new(ttl: Duration) -> Self {
        Self {
            ttl,
            reload: Mutex::new(Reload::default()),
        }
    }

    pub fn ttl(&self) -> Duration {
        self.ttl
    }

    pub async fn public(
        &self,
        db: &PgPool,
        redis: &ConnectionManager,
    ) -> Result<(String, String), AppError> {
        let mut r = redis.clone();
        let cached: redis::RedisResult<(Option<String>, Option<String>)> =
            r.hmget(KEY, &["json", "etag"]).await;
        let redis_ok = match cached {
            Ok((Some(json), Some(etag))) => return Ok((json, etag)),
            Ok(_) => true,
            Err(e) => {
                tracing::warn!(error = %e, "quiz: Redis lỗi, dùng bản trong RAM");
                false
            }
        };
        let bank = self.load_shared(db, redis_ok.then_some(&mut r)).await?;
        Ok((bank.json.clone(), bank.etag.clone()))
    }

    pub async fn correct_answer(
        &self,
        db: &PgPool,
        redis: &ConnectionManager,
        question_id: i64,
    ) -> Result<Option<i64>, AppError> {
        let mut r = redis.clone();
        let cached = async {
            let a: Option<i64> = r.hget(KEY, format!("c:{question_id}")).await?;
            let known = a.is_some() || r.exists::<_, bool>(KEY).await?;
            Ok::<_, redis::RedisError>(known.then_some(a))
        }
        .await;
        let redis_ok = match cached {
            Ok(Some(a)) => return Ok(a),
            Ok(None) => true,
            Err(e) => {
                tracing::warn!(error = %e, "quiz: Redis lỗi, dùng bản trong RAM");
                false
            }
        };
        let bank = self.load_shared(db, redis_ok.then_some(&mut r)).await?;
        Ok(bank.correct.get(&question_id).copied())
    }

    async fn load_shared(
        &self,
        db: &PgPool,
        redis: Option<&mut ConnectionManager>,
    ) -> Result<Arc<Bank>, AppError> {
        let asked = Instant::now();
        let mut st = self.reload.lock().await;

        if let Some((at, bank)) = &st.local
            && (*at >= asked || (redis.is_none() && at.elapsed() < self.ttl))
        {
            return Ok(bank.clone());
        }
        if st
            .failed_at
            .is_some_and(|t| t >= asked || t.elapsed() < FAIL_BACKOFF)
        {
            return Err(AppError::Unavailable);
        }

        let bank = match load(db).await {
            Ok(b) => Arc::new(b),
            Err(e) => {
                st.failed_at = Some(Instant::now());
                return Err(e);
            }
        };
        st.failed_at = None;
        st.local = Some((Instant::now(), bank.clone()));
        if let Some(r) = redis
            && let Err(e) = self.store(r, &bank).await
        {
            tracing::warn!(error = %e, "quiz: không ghi được cache Redis");
        }
        tracing::info!(
            questions = bank.correct.len(),
            "quiz: nạp lại bộ câu hỏi từ DB"
        );
        Ok(bank)
    }

    async fn store(&self, r: &mut ConnectionManager, bank: &Bank) -> redis::RedisResult<()> {
        let mut fields: Vec<(String, String)> = vec![
            ("json".into(), bank.json.clone()),
            ("etag".into(), bank.etag.clone()),
        ];
        fields.extend(
            bank.correct
                .iter()
                .map(|(q, a)| (format!("c:{q}"), a.to_string())),
        );
        redis::pipe()
            .atomic()
            .del(KEY)
            .ignore()
            .hset_multiple(KEY, &fields)
            .ignore()
            .expire(KEY, self.ttl.as_secs() as i64)
            .ignore()
            .query_async(r)
            .await
    }
}

async fn load(db: &PgPool) -> Result<Bank, AppError> {
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT q.id, q.content, a.id, a.content, qa.is_correct
         FROM quiz_questions q
         JOIN quiz_question_answers qa ON qa.question_id = q.id
         JOIN quiz_answers a ON a.id = qa.answer_id
         ORDER BY q.id, a.id",
    )
    .fetch_all(db)
    .await?;
    Ok(build(rows))
}

type Row = (i64, String, i64, String, bool);

fn build(rows: Vec<Row>) -> Bank {
    let mut questions: Vec<PublicQuestion> = Vec::new();
    let mut correct_of: Vec<Vec<i64>> = Vec::new();
    for (qid, q, aid, text, ok) in rows {
        if questions.last().is_none_or(|last| last.id != qid) {
            questions.push(PublicQuestion {
                id: qid,
                q,
                answers: Vec::new(),
            });
            correct_of.push(Vec::new());
        }
        let (Some(last), Some(ok_ids)) = (questions.last_mut(), correct_of.last_mut()) else {
            unreachable!("vừa push ở trên")
        };
        last.answers.push(PublicAnswer { id: aid, text });
        if ok {
            ok_ids.push(aid);
        }
    }

    let mut correct = HashMap::new();
    let mut valid = Vec::with_capacity(questions.len());
    for (q, ok) in questions.into_iter().zip(correct_of) {
        if (MIN_ANSWERS..=MAX_ANSWERS).contains(&q.answers.len()) && ok.len() == 1 {
            correct.insert(q.id, ok[0]);
            valid.push(q);
        } else {
            tracing::warn!(
                question_id = q.id,
                answers = q.answers.len(),
                correct = ok.len(),
                "quiz: bỏ qua câu không hợp lệ (cần {MIN_ANSWERS}–{MAX_ANSWERS} đáp án, đúng 1 đáp án đúng)"
            );
        }
    }
    let json =
        serde_json::to_string(&PublicBank { questions: &valid }).expect("serialize bộ câu hỏi");
    let etag = format!("\"{:016x}\"", fnv1a(json.as_bytes()));
    Bank {
        json,
        etag,
        correct,
    }
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, &b| {
        (h ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

pub fn etag_matches(if_none_match: &str, etag: &str) -> bool {
    let strip = |t: &str| t.trim().trim_start_matches("W/").to_owned();
    let ours = strip(etag);
    if_none_match
        .split(',')
        .any(|t| t.trim() == "*" || strip(t) == ours)
}
