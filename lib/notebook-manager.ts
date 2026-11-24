export const NOTEBOOK_SUBJECT_GROUPS = [
  { label: '国語', subjects: ['現代の国語', '言語文化', '論理国語', '文学国語', '国語表現', '国語演習', '古典探求', '古典探究'] },
  { label: '地理・歴史', subjects: ['地理総合', '地理探究', '歴史総合', '日本史探究', '世界史探究'] },
  { label: '公民', subjects: ['公共', '倫理', '政治・経済'] },
  { label: '数学', subjects: ['数学I', '数学II', '数学III', '数学A', '数学B', '数学C', '数学演習'] },
  { label: '理科', subjects: ['科学と人間生活', '物理基礎', '物理', '化学基礎', '化学', '生物基礎', '生物', '地学基礎', '地学'] },
  { label: '英語', subjects: ['英語コミュニケーションI', '英語コミュニケーションII', '英語コミュニケーションIII', '英コミュ', '論理・表現I', '論理・表現II', '論理・表現III', '論表', '英語演習'] },
  { label: '情報', subjects: ['情報', '情報I', '情報II'] },
  { label: '保健体育', subjects: ['保健', '体育', '保健体育'] },
  { label: '芸術', subjects: ['音楽I', '音楽II', '美術I', '美術II', '書道I', '書道II'] },
  { label: '家庭', subjects: ['家庭基礎', '家庭総合'] },
  { label: '探究・その他', subjects: ['総合的な探究の時間', '探究活動', '学校設定科目', 'その他'] },
] as const;

export const NOTEBOOK_SUBJECT_OPTIONS = NOTEBOOK_SUBJECT_GROUPS.flatMap(group => [...group.subjects]);
export const NOTEBOOK_SIZE_OPTIONS = ['B5', 'A4', 'A5', 'A6', 'B6', 'その他'] as const;
export const NOTEBOOK_PURPOSE_OPTIONS = ['授業', '課題', '演習', 'まとめ', '試験対策', 'その他'] as const;
export type NotebookPurpose = typeof NOTEBOOK_PURPOSE_OPTIONS[number];
export const NOTEBOOK_STATUS_OPTIONS = [
  { value: 'unused', label: '未使用' }, { value: 'in_use', label: '使用中' },
  { value: 'stored', label: '保管中' }, { value: 'finished', label: '使用終了' },
] as const;
export type NotebookStatus = typeof NOTEBOOK_STATUS_OPTIONS[number]['value'];

export type NotebookDuplicateCandidate = {
  id: string; name: string; subjects: string[]; purpose: string;
  status: NotebookStatus; total_pages: number; used_pages: number;
};

export function getNotebookRemainingPages(totalPages: number, usedPages: number): number {
  const total = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0;
  const used = Number.isFinite(usedPages) ? Math.max(0, Math.floor(usedPages)) : 0;
  return Math.max(0, total - Math.min(total, used));
}
export function getNotebookRemainingPercent(totalPages: number, usedPages: number): number {
  const total = Number.isFinite(totalPages) ? Math.max(0, Math.floor(totalPages)) : 0;
  if (total === 0) return 0;
  return Math.round((getNotebookRemainingPages(total, usedPages) / total) * 100);
}
export function getNotebookStatusLabel(status: NotebookStatus): string {
  return NOTEBOOK_STATUS_OPTIONS.find(item => item.value === status)?.label || '不明';
}
export function findNotebookDuplicates(
  notebooks: readonly NotebookDuplicateCandidate[], subjects: readonly string[],
  purpose: string, excludeId: string | null = null,
): NotebookDuplicateCandidate[] {
  if (!subjects.length || !purpose.trim()) return [];
  const selected = new Set(subjects);
  return notebooks.filter(notebook =>
    notebook.id !== excludeId
    && notebook.status !== 'finished'
    && notebook.purpose.trim().toLocaleLowerCase() === purpose.trim().toLocaleLowerCase()
    && notebook.subjects.some(subject => selected.has(subject))
    && getNotebookRemainingPages(notebook.total_pages, notebook.used_pages) > 0,
  );
}
