DROP INDEX IF EXISTS quiz_question_answers_one_correct;

ALTER TABLE quiz_answers ADD COLUMN is_correct BOOLEAN NOT NULL DEFAULT false;

UPDATE quiz_answers a
SET is_correct = true
WHERE EXISTS (
    SELECT 1 FROM quiz_question_answers qa WHERE qa.answer_id = a.id AND qa.is_correct
);

ALTER TABLE quiz_question_answers DROP COLUMN is_correct;
