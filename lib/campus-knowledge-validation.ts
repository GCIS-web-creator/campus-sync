export const KNOWLEDGE_DIFFICULTIES = ['normal', 'advanced', 'challenge'] as const;

export type KnowledgeDifficulty = typeof KNOWLEDGE_DIFFICULTIES[number];
export type KnowledgeOption = { id: string; text: string };
export type KnowledgeQuestionInput = {
  subject: string;
  title: string;
  prompt: string;
  options: KnowledgeOption[];
  correct_option_id: string;
  explanation: string;
  difficulty: KnowledgeDifficulty;
  target_class: string;
  status: 'draft' | 'published';
};

const OPTION_ID = /^[a-z][a-z0-9_-]{0,11}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateKnowledgeQuestion(input: unknown):
  | { value: KnowledgeQuestionInput; error?: never }
  | { value?: never; error: string } {
  if (!isRecord(input)) return { error: '問題データを読み取れません。' };

  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const explanation = typeof input.explanation === 'string' ? input.explanation.trim() : '';
  const correct_option_id = typeof input.correct_option_id === 'string' ? input.correct_option_id.trim() : '';
  const target_class = typeof input.target_class === 'string' ? input.target_class.trim() : 'all';
  const difficulty = input.difficulty;
  const status = input.status === 'published' ? 'published' : input.status === 'draft' || input.status === undefined ? 'draft' : null;

  if (!subject || subject.length > 80) return { error: '教科は1〜80文字で入力してください。' };
  if (!title || title.length > 160) return { error: '問題名は1〜160文字で入力してください。' };
  if (!prompt || prompt.length > 4000) return { error: '問題文は1〜4000文字で入力してください。' };
  if (explanation.length > 2000) return { error: '解説は2000文字以内で入力してください。' };
  if (!target_class || target_class.length > 80) return { error: '対象クラスを確認してください。' };
  if (!KNOWLEDGE_DIFFICULTIES.includes(difficulty as KnowledgeDifficulty)) {
    return { error: '難易度を選択してください。' };
  }
  if (!status) return { error: '公開状態が正しくありません。' };
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 6) {
    return { error: '選択肢は2〜6個にしてください。' };
  }

  const options: KnowledgeOption[] = [];
  const seen = new Set<string>();
  for (const option of input.options) {
    if (!isRecord(option)) return { error: '選択肢の形式が正しくありません。' };
    const id = typeof option.id === 'string' ? option.id.trim() : '';
    const text = typeof option.text === 'string' ? option.text.trim() : '';
    if (!OPTION_ID.test(id)) return { error: '選択肢IDが正しくありません。' };
    if (seen.has(id)) return { error: '選択肢IDが重複しています。' };
    if (!text || text.length > 500) return { error: '選択肢は1〜500文字で入力してください。' };
    seen.add(id);
    options.push({ id, text });
  }

  if (!OPTION_ID.test(correct_option_id) || !seen.has(correct_option_id)) {
    return { error: '正解の選択肢を指定してください。' };
  }

  return {
    value: {
      subject, title, prompt, options, correct_option_id, explanation,
      difficulty: difficulty as KnowledgeDifficulty, target_class, status,
    },
  };
}

export function validateKnowledgeAttempt(input: unknown):
  | { value: { question_id: string; attempt_id: string; selected_option_id: string }; error?: never }
  | { value?: never; error: string } {
  if (!isRecord(input)) return { error: '回答データを読み取れません。' };
  const question_id = typeof input.question_id === 'string' ? input.question_id.trim() : '';
  const attempt_id = typeof input.attempt_id === 'string' ? input.attempt_id.trim() : '';
  const selected_option_id = typeof input.selected_option_id === 'string' ? input.selected_option_id.trim() : '';
  if (!UUID.test(question_id)) return { error: '問題IDが正しくありません。' };
  if (!UUID.test(attempt_id)) return { error: '回答IDが正しくありません。' };
  if (!OPTION_ID.test(selected_option_id)) return { error: '選択肢を選んでください。' };
  return { value: { question_id, attempt_id, selected_option_id } };
}
