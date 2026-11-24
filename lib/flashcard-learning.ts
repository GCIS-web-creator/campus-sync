export type FlashcardProgressLike = {
  status?: "new" | "learning" | "known" | "review";
  correct_count?: number;
  incorrect_count?: number;
  consecutive_correct?: number;
  interval_days?: number | string;
  ease_factor?: number | string;
};

export type ReviewUpdate = {
  status: "learning" | "known";
  correct_count: number;
  incorrect_count: number;
  consecutive_correct: number;
  interval_days: number;
  ease_factor: number;
  last_reviewed_at: string;
  next_review_at: string;
  updated_at: string;
};

export function normalizeFlashcardAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[。、，．,.!?！？:：;；]/g, "");
}

export function isFlashcardAnswerCorrect(actual: string, expected: string): boolean {
  const normalizedActual = normalizeFlashcardAnswer(actual);
  const normalizedExpected = normalizeFlashcardAnswer(expected);
  return normalizedActual.length > 0 && normalizedActual === normalizedExpected;
}

export function parseFlashcardImport(text: string): Array<{ term: string; definition: string }> {
  const rows: Array<{ term: string; definition: string }> = [];
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let parts: string[] = [];
    if (line.includes("\t")) {
      parts = line.split("\t");
    } else if (line.includes("｜")) {
      parts = line.split("｜");
    } else if (line.includes("::")) {
      parts = line.split("::");
    } else {
      // Simple CSV parser supporting quoted commas and escaped double quotes.
      let field = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"' && quoted && line[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          parts.push(field);
          field = "";
        } else {
          field += char;
        }
      }
      parts.push(field);
    }
    if (parts.length < 2) continue;
    const term = String(parts[0] ?? "").trim();
    const definition = parts.slice(1).join(line.includes("\t") ? "\t" : line.includes("｜") ? "｜" : line.includes("::") ? "::" : ",").trim();
    if (!rows.length && /^(term|用語|単語|問題)$/i.test(term) && /^(definition|定義|答え|意味)$/i.test(definition)) continue;
    if (term && definition) rows.push({ term, definition });
  }
  return rows;
}

export function shuffleFlashcards<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createFlashcardChoices<T extends { id: string; definition: string }>(
  cards: readonly T[],
  target: T,
  limit = 4,
  random: () => number = Math.random,
): Array<{ id: string; text: string; correct: boolean }> {
  const distractors = shuffleFlashcards(
    cards.filter(card => card.id !== target.id && card.definition.trim() && card.definition !== target.definition),
    random,
  ).slice(0, Math.max(0, limit - 1));
  return shuffleFlashcards(
    [{ id: target.id, text: target.definition, correct: true }, ...distractors.map(card => ({
      id: card.id,
      text: card.definition,
      correct: false,
    }))],
    random,
  );
}

export function calculateFlashcardReview(
  previous: FlashcardProgressLike | undefined,
  correct: boolean,
  now: Date = new Date(),
): ReviewUpdate {
  const correctCount = Math.max(0, Number(previous?.correct_count || 0)) + (correct ? 1 : 0);
  const incorrectCount = Math.max(0, Number(previous?.incorrect_count || 0)) + (correct ? 0 : 1);
  const streak = correct ? Math.max(0, Number(previous?.consecutive_correct || 0)) + 1 : 0;
  const oldEase = Math.min(3, Math.max(1.3, Number(previous?.ease_factor || 2.5)));
  const oldInterval = Math.max(0, Number(previous?.interval_days || 0));
  const ease = correct ? Math.min(3, oldEase + (streak >= 3 ? 0.05 : 0)) : Math.max(1.3, oldEase - 0.2);
  const interval = correct
    ? (streak === 1 ? 1 : streak === 2 ? 3 : Math.max(4, Math.round(Math.max(3, oldInterval) * ease * 10) / 10))
    : 0.01;
  const next = new Date(now.getTime() + (correct ? interval * 24 * 60 * 60 * 1000 : 10 * 60 * 1000));
  return {
    status: correct && (streak >= 3 || interval >= 7) ? "known" : "learning",
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    consecutive_correct: streak,
    interval_days: interval,
    ease_factor: Math.round(ease * 100) / 100,
    last_reviewed_at: now.toISOString(),
    next_review_at: next.toISOString(),
    updated_at: now.toISOString(),
  };
}
