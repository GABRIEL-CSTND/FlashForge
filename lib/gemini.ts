import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

export interface GeneratedFlashcard {
  question: string;
  answer: string;
}

const MIN_CARDS = 8;
const MAX_CARDS = 20;

export async function generateFlashcards(
  sourceText: string
): Promise<GeneratedFlashcard[]> {
  const prompt = `You are helping a student study. Read the study material below and generate between ${MIN_CARDS} and ${MAX_CARDS} flashcards (question + answer pairs) covering the key concepts, definitions, and facts.

Rules:
- Base the count on how much distinct content is in the material (short material = fewer cards, dense material = more, but never fewer than ${MIN_CARDS} or more than ${MAX_CARDS}).
- Questions should be clear and answerable from the material alone.
- Answers should be concise (1-2 sentences).
- Return ONLY valid JSON, no markdown formatting, no code fences, no extra commentary.
- Output format (a JSON array):
[
  { "question": "...", "answer": "..." }
]

Study material:
"""
${sourceText.slice(0, 30000)}
"""`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI returned invalid JSON for flashcards.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('AI response was not an array of flashcards.');
  }

  return (parsed as GeneratedFlashcard[]).filter(
    (card) =>
      card &&
      typeof card.question === 'string' &&
      typeof card.answer === 'string'
  );
}
