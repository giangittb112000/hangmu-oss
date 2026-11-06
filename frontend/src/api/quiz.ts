import { api } from './client'

export type QuizAnswer = { id: number; text: string }
export type QuizQuestion = { id: number; q: string; answers: QuizAnswer[] }
export type QuizResult = { correct: boolean; correctAnswerId: number }

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

let deck: QuizQuestion[] = []

export async function nextQuestion(signal?: AbortSignal): Promise<QuizQuestion | null> {
  if (deck.length === 0) {
    const { questions } = await api<{ questions: QuizQuestion[] }>('/quiz', { signal })
    deck = shuffle(questions)
  }
  const q = deck.pop()
  return q ? { ...q, answers: shuffle(q.answers) } : null
}

export function putBack(q: QuizQuestion) {
  deck.push(q)
}

export const submitAnswer = (questionId: number, answerId: number, signal?: AbortSignal) =>
  api<QuizResult>('/quiz/answer', { method: 'POST', body: { questionId, answerId }, signal })
