ALTER TABLE quiz_question_answers ADD COLUMN is_correct BOOLEAN NOT NULL DEFAULT false;

UPDATE quiz_question_answers qa
SET is_correct = a.is_correct
FROM quiz_answers a
WHERE a.id = qa.answer_id;

ALTER TABLE quiz_answers DROP COLUMN is_correct;

CREATE UNIQUE INDEX IF NOT EXISTS quiz_question_answers_one_correct
    ON quiz_question_answers (question_id) WHERE is_correct;
