export const NOTEBOOK_SUBJECT_OPTIONS = [
  '国語演習', '古典探求', '物理', '生物', '数学III', '数学C',
  '公共', '英コミュ', '論表', '情報', '保健', '化学', 'その他',
] as const;
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
