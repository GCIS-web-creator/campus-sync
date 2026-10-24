// v3の状況行を使い、学習済みモデルが生成したテンプレートに実データを埋め込む。
import { generate, loadModel } from './model';

export type Availability = 'あり' | 'なし';
export type Direction = '国分寺方面' | '東村山方面' | '両方';
export type Target = 'なし' | '学食' | '課題' | '教室' | '部活' | '蔵書' | 'キャリア' | '落とし物' | '口コミ' | '貢献度' | '通知';

export type Counts = {
  menu: number;
  kokubunji: number;
  higashimurayama: number;
  task: number;
  room: Availability;
  vote: Availability;
  sold: Availability;
  club: Availability;
  books: Availability;
  career: Availability;
  lost: Availability;
  reviews: Availability;
  contribution: Availability;
  notifications: Availability;
};

export function situation(c: Counts, direction: Direction, target: Target): string {
  return `学食${c.menu}件 国分寺${c.kokubunji}件 東村山${c.higashimurayama}件 課題${c.task}件 教室${c.room} 方面${direction} 対象${target} 投票${c.vote} 売切${c.sold} 部活ノート${c.club} 蔵書${c.books} キャリア${c.career} 落とし物${c.lost} 口コミ${c.reviews} 貢献度${c.contribution} 通知${c.notifications}`;
}

export const fmtPrompt = (sit: string, question: string) => `【状況】${sit}\n【質問】${question}\n【回答】`;
export function template(sit: string, question: string): string {
  return generate(loadModel(), fmtPrompt(sit, question), 110).text;
}

export function fill(tpl: string, slots: Record<string, string | number>): string | null {
  const keys = [...tpl.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
  if (keys.some(k => !(k in slots))) return null;
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(slots[k]));
}

export function answerDetailed(
  counts: Counts,
  direction: Direction,
  target: Target,
  question: string,
  slots: Record<string, string | number>,
): { tpl: string; text: string } {
  const tpl = template(situation(counts, direction, target), question);
  return { tpl, text: fill(tpl, slots) ?? 'すみません、必要なデータをすべて読み込めませんでした。少し待ってからもう一度試してください。' };
}

export function answer(
  counts: Counts,
  direction: Direction,
  target: Target,
  question: string,
  slots: Record<string, string | number>,
): string {
  return answerDetailed(counts, direction, target, question, slots).text;
}

export const isTaskTemplate = (tpl: string) =>
  /\{(J\d|D\d|TJ|TD)\}/.test(tpl) || tpl.includes('課題はありません') || tpl.includes('現在出ている課題はありません') || tpl.startsWith('その課題は');
