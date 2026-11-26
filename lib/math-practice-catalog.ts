export type MathCatalogItem = {
  id: string;
  title: string;
  prompt: string;
  subject: string;
  unit: string;
  difficulty: string;
};

export function filterMathPracticeQuestions<T extends MathCatalogItem>(
  items: readonly T[],
  query: string,
  difficulty: string = 'all',
): T[] {
  const needle = query.trim().toLocaleLowerCase('ja-JP').replace(/\s+/g, ' ');
  return items.filter(item => {
    if (difficulty !== 'all' && item.difficulty !== difficulty) return false;
    if (!needle) return true;
    const haystack = [item.id, item.title, item.prompt, item.subject, item.unit]
      .join(' ')
      .toLocaleLowerCase('ja-JP')
      .replace(/\s+/g, ' ');
    return haystack.includes(needle);
  });
}

export function paginateMathPracticeQuestions<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number = 30,
): { items: T[]; page: number; pageCount: number; start: number; end: number } {
  const safeSize = Number.isFinite(pageSize) ? Math.max(1, Math.min(100, Math.floor(pageSize))) : 30;
  const pageCount = Math.max(1, Math.ceil(items.length / safeSize));
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.min(pageCount, Math.floor(requestedPage)))
    : 1;
  const start = items.length ? (page - 1) * safeSize : 0;
  const end = Math.min(items.length, start + safeSize);
  return { items: items.slice(start, end), page, pageCount, start, end };
}
