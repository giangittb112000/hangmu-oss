
CREATE TABLE IF NOT EXISTS quiz_questions (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_answers (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content     TEXT NOT NULL,
    is_correct  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_question_answers (
    question_id BIGINT NOT NULL REFERENCES quiz_questions (id) ON DELETE CASCADE,
    answer_id   BIGINT NOT NULL REFERENCES quiz_answers (id) ON DELETE CASCADE,
    PRIMARY KEY (question_id, answer_id)
);

CREATE INDEX IF NOT EXISTS quiz_question_answers_answer_idx ON quiz_question_answers (answer_id);
