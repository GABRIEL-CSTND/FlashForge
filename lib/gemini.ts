const GEMINI_MODEL = 'gemini-3.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type StudyType = 'flashcard' | 'multiple_choice';

export interface GeneratedItem {
  question: string;
  answer: string;
  options?: string[];
}

const TYPE_INSTRUCTIONS: Record<StudyType, string> = {
  flashcard: `Create flashcards. Each item has a clear "question" and a concise "answer". No "options" field.`,
  multiple_choice: `Create multiple-choice questions. Each item has a "question", an "options" array of exactly 4 plausible choices (in random order), and an "answer" field that exactly matches one of the strings in "options" (the correct one).`,
};

export async function generateStudyItems(
  sourceText: string,
  studyType: StudyType
): Promise<GeneratedItem[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const prompt = `You are creating a study guide from the text below.
Produce exactly 10 items. ${TYPE_INSTRUCTIONS[studyType]}
Base everything strictly on the provided text. Avoid trivial or overly broad questions.

TEXT:
"""
${sourceText.slice(0, 30000)}
"""`;

  const itemSchema =
    studyType === 'multiple_choice'
      ? {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            options: { type: 'ARRAY', items: { type: 'STRING' } },
            answer: { type: 'STRING' },
          },
          required: ['question', 'options', 'answer'],
        }
      : {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            answer: { type: 'STRING' },
          },
          required: ['question', 'answer'],
        };

  const res = await fetch(`${API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: { type: 'ARRAY', items: itemSchema },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no content');

  const items = JSON.parse(text) as GeneratedItem[];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Gemini returned no study items');
  }
  return items.slice(0, 10);
}
