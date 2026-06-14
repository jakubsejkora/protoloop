import { z } from 'zod'
import type { PlanningQuestion } from './types'

/**
 * The structured planning-questions block the agent emits on its first turn:
 * a fenced ```protoloop-questions / ```json block (or a bare object) containing
 * `{ "questions": [ { "question": string, "options": string[] } ] }`.
 */
export const planningQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string()).default([])
})

export const questionsBlockSchema = z.object({
  questions: z.array(planningQuestionSchema)
})

export type QuestionsBlock = z.infer<typeof questionsBlockSchema>

/**
 * Extract structured planning questions from an agent reply. Accepts a fenced
 * ```protoloop-questions / ```json block or a bare JSON object containing a
 * "questions" array. Returns the cleaned questions, or null if none/invalid.
 * (An empty `questions` array also returns null → caller treats it as "no card".)
 */
export function parseQuestionsBlock(text: string): PlanningQuestion[] | null {
  const candidates: string[] = []
  const fence = /```(?:protoloop-questions|json)?\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) candidates.push(m[1])
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open !== -1 && close > open) candidates.push(text.slice(open, close + 1))

  for (const c of candidates) {
    let json: unknown
    try {
      json = JSON.parse(c.trim())
    } catch {
      continue
    }
    const parsed = questionsBlockSchema.safeParse(json)
    if (!parsed.success) continue
    const cleaned = parsed.data.questions
      .map((q) => ({
        question: q.question.trim(),
        options: q.options.map((o) => o.trim()).filter(Boolean)
      }))
      .filter((q) => q.question.length > 0)
    if (cleaned.length > 0) return cleaned
  }
  return null
}
