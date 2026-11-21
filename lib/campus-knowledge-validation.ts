export const KNOWLEDGE_DIFFICULTIES = ['normal', 'advanced', 'challenge'] as const;
export const KNOWLEDGE_QUESTION_TYPES = ['multiple_choice', 'numeric', 'written'] as const;

export type KnowledgeDifficulty = typeof KNOWLEDGE_DIFFICULTIES[number];
export type KnowledgeQuestionType = typeof KNOWLEDGE_QUESTION_TYPES[number];
export type KnowledgeOption = { id: string; text: string };
export type KnowledgeQuestionInput = {
  subject: string;
  subject_code: string | null;
  unit: string;
  title: string;
  prompt: string;
  question_type: KnowledgeQuestionType;
  options: KnowledgeOption[];
  correct_option_id: string | null;
  correct_answer: string | null;
  answer_tolerance: number;
  explanation: string;
  difficulty: KnowledgeDifficulty;
  target_class: string;
  status: 'draft' | 'published';
  source_name: string;
  source_url: string | null;
  source_license: string | null;
  source_attribution: string | null;
  source_revision: string | null;
};

const OPTION_ID = /^[a-z][a-z0-9_-]{0,11}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ANSWER = /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/;
const SUBJECT_CODES = ['math1', 'matha', 'math2', 'mathb', 'math3', 'mathc'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function validateKnowledgeQuestion(input: unknown):
  | { value: KnowledgeQuestionInput; error?: never }
  | { value?: never; error: string } {
  if (!isRecord(input)) return { error: '問題データを読み取れません。' };

  const subject = readString(input.subject);
  const subject_code_raw = readString(input.subject_code);
  const subject_code = subject_code_raw || null;
  const unit = readString(input.unit, '未分類') || '未分類';
  const title = readString(input.title);
  const prompt = readString(input.prompt);
  const explanation = readString(input.explanation);
  const question_type = (input.question_type === undefined ? 'multiple_choice' : input.question_type) as KnowledgeQuestionType;
  const difficulty = input.difficulty;
  const status = input.status === 'published' ? 'published' : input.status === 'draft' || input.status === undefined ? 'draft' : null;
  const target_class = input.target_class === undefined ? 'all' : readString(input.target_class);
  const source_name = readString(input.source_name, 'CampusSyncオリジナル') || 'CampusSyncオリジナル';
  const source_url = readString(input.source_url) || null;
  const source_license_text = readString(input.source_license);
  const source_attribution_text = readString(input.source_attribution);
  const source_revision_text = readString(input.source_revision);
  const source_license = source_license_text || null;
  const source_attribution = source_attribution_text || null;
  const source_revision = source_revision_text || null;
  const correct_answer = readString(input.correct_answer) || null;
  const toleranceRaw = input.answer_tolerance === undefined ? 0 : Number(input.answer_tolerance);
  const answer_tolerance = Number.isFinite(toleranceRaw) ? toleranceRaw : -1;
  const correct_option_id = readString(input.correct_option_id) || null;

  if (!subject || subject.length > 80) return { error: '教科は1〜80文字で入力してください。' };
  if (subject_code && !SUBJECT_CODES.includes(subject_code)) return { error: '教科コードが正しくありません。' };
  if (!unit || unit.length > 120) return { error: '単元は1〜120文字で入力してください。' };
  if (!title || title.length > 160) return { error: '問題名は1〜160文字で入力してください。' };
  if (!prompt || prompt.length > 4000) return { error: '問題文は1〜4000文字で入力してください。' };
  if (explanation.length > 2000) return { error: '解説は2000文字以内で入力してください。' };
  if (!target_class || target_class.length > 80) return { error: '対象クラスを確認してください。' };
  if (!KNOWLEDGE_DIFFICULTIES.includes(difficulty as KnowledgeDifficulty)) {
    return { error: '難易度を選択してください。' };
  }
  if (!KNOWLEDGE_QUESTION_TYPES.includes(question_type)) return { error: '問題形式を選択してください。' };
  if (!status) return { error: '公開状態が正しくありません。' };
  if (!source_name || source_name.length > 120) return { error: '出典名は1〜120文字で入力してください。' };
  if (source_url && (source_url.length > 2048 || !/^https:\/\/\S+$/i.test(source_url))) return { error: '出典URLはhttps://から始まるURLを入力してください。' };
  if (source_license_text.length > 100 || source_attribution_text.length > 500 || source_revision_text.length > 200) {
    return { error: '出典情報の文字数が上限を超えています。' };
  }
  if (source_url && (!source_license || !source_attribution)) {
    return { error: '外部教材を使う場合はライセンスと出典表示を必ず入力してください。' };
  }
  const sourceLabel = source_name.toLocaleLowerCase('ja-JP');
  if (source_url && sourceLabel.includes('wikibooks') && !source_revision) {
    return { error: 'Wikibooksを参照した場合はページrevision IDを記録してください。' };
  }
  if (source_url && sourceLabel.includes('wikibooks') && !/CC BY-SA 4\.0|GFDL/i.test(source_license || '')) {
    return { error: 'Wikibooksの再利用条件を確認してライセンスを記録してください。' };
  }
  if (source_url && sourceLabel.includes('ftext') && !/CC BY 4\.0/i.test(source_license || '')) {
    return { error: 'FTEXTのCC BY 4.0ライセンスを確認してください。' };
  }
  if (!Number.isFinite(answer_tolerance) || answer_tolerance < 0 || answer_tolerance > 1000000000000) {
    return { error: '数値の許容誤差が正しくありません。' };
  }

  const rawOptions = input.options === undefined ? [] : input.options;
  if (!Array.isArray(rawOptions)) return { error: '選択肢の形式が正しくありません。' };
  const options: KnowledgeOption[] = [];
  const seen = new Set<string>();

  if (question_type === 'multiple_choice') {
    if (rawOptions.length < 2 || rawOptions.length > 6) return { error: '選択肢は2〜6個にしてください。' };
    for (const option of rawOptions) {
      if (!isRecord(option)) return { error: '選択肢の形式が正しくありません。' };
      const id = readString(option.id);
      const text = readString(option.text);
      if (!OPTION_ID.test(id)) return { error: '選択肢IDが正しくありません。' };
      if (seen.has(id)) return { error: '選択肢IDが重複しています。' };
      if (!text || text.length > 500) return { error: '選択肢は1〜500文字で入力してください。' };
      seen.add(id);
      options.push({ id, text });
    }
    if (!correct_option_id || !OPTION_ID.test(correct_option_id) || !seen.has(correct_option_id)) {
      return { error: '正解の選択肢を指定してください。' };
    }
  } else {
    if (rawOptions.length !== 0) return { error: '数値入力・記述式では選択肢を指定しないでください。' };
    if (!correct_answer || correct_answer.length > 2000) return { error: '模範解答を1〜2000文字で入力してください。' };
    if (question_type === 'numeric' && correct_answer.length > 120) return { error: '数値の正答は120文字以内で入力してください。' };
    if (question_type === 'numeric' && !NUMERIC_ANSWER.test(correct_answer)) {
      return { error: '数値入力式の正答は数値で入力してください。' };
    }
  }

  return {
    value: {
      subject, subject_code, unit, title, prompt, question_type, options,
      correct_option_id: question_type === 'multiple_choice' ? correct_option_id : null,
      correct_answer: question_type === 'multiple_choice' ? null : correct_answer,
      answer_tolerance: question_type === 'numeric' ? answer_tolerance : 0,
      explanation, difficulty: difficulty as KnowledgeDifficulty, target_class, status,
      source_name, source_url, source_license: source_license || null,
      source_attribution: source_attribution || null, source_revision: source_revision || null,
    },
  };
}

export function validateKnowledgeAttempt(input: unknown):
  | { value: { question_id: string; attempt_id: string; selected_option_id: string | null; selected_answer: string | null }; error?: never }
  | { value?: never; error: string } {
  if (!isRecord(input)) return { error: '回答データを読み取れません。' };
  const question_id = readString(input.question_id);
  const attempt_id = readString(input.attempt_id);
  const selected_option_id = readString(input.selected_option_id) || null;
  const selected_answer = readString(input.selected_answer) || null;

  if (!UUID.test(question_id)) return { error: '問題IDが正しくありません。' };
  if (!UUID.test(attempt_id)) return { error: '回答IDが正しくありません。' };
  if (selected_option_id && !OPTION_ID.test(selected_option_id)) return { error: '選択肢IDが正しくありません。' };
  if (selected_option_id && selected_answer) return { error: '回答形式が正しくありません。' };
  if (!selected_option_id && (!selected_answer || selected_answer.length > 2000)) return { error: '解答を入力してください。' };

  return { value: { question_id, attempt_id, selected_option_id, selected_answer } };
}
