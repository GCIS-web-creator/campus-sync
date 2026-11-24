import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFlashcardReview,
  createFlashcardChoices,
  isFlashcardAnswerCorrect,
  normalizeFlashcardAnswer,
  parseFlashcardImport,
  shuffleFlashcards,
} from "../lib/flashcard-learning.ts";

test("answer normalization handles width, case, and whitespace", () => {
  assert.equal(normalizeFlashcardAnswer(" Ｈｅｌｌｏ World！ "), "helloworld");
  assert.equal(isFlashcardAnswerCorrect("　Inevitable ", "inevitable"), true);
  assert.equal(isFlashcardAnswerCorrect("inevitable!", "unavoidable"), false);
});

test("import parser supports TSV, pipe, separator, and quoted CSV", () => {
  assert.deepEqual(parseFlashcardImport("apple\tりんご\nbook\t本"), [
    { term: "apple", definition: "りんご" },
    { term: "book", definition: "本" },
  ]);
  assert.deepEqual(parseFlashcardImport('term,definition\nred,"赤, 紅"\nblue｜青\ngreen::緑'), [
    { term: "red", definition: "赤, 紅" },
    { term: "blue", definition: "青" },
    { term: "green", definition: "緑" },
  ]);
});

test("review schedule shortens failed cards and gradually increases successful intervals", () => {
  const now = new Date("2026-11-24T03:00:00.000Z");
  const first = calculateFlashcardReview(undefined, true, now);
  assert.equal(first.interval_days, 1);
  assert.equal(first.status, "learning");
  const second = calculateFlashcardReview(first, true, now);
  assert.equal(second.interval_days, 3);
  const third = calculateFlashcardReview(second, true, now);
  assert.equal(third.status, "known");
  assert.ok(new Date(third.next_review_at).getTime() > now.getTime());
  const failed = calculateFlashcardReview(third, false, now);
  assert.equal(failed.status, "learning");
  assert.equal(failed.consecutive_correct, 0);
  assert.equal(new Date(failed.next_review_at).getTime() - now.getTime(), 10 * 60 * 1000);
});

test("choice generator has a single correct option and deterministic shuffle injection", () => {
  const cards = [
    { id: "a", definition: "A" },
    { id: "b", definition: "B" },
    { id: "c", definition: "C" },
    { id: "d", definition: "D" },
  ];
  const options = createFlashcardChoices(cards, cards[0], 4, () => 0);
  assert.equal(options.length, 4);
  assert.equal(options.filter(option => option.correct).length, 1);
  assert.equal(options.find(option => option.correct)?.id, "a");
  assert.equal(shuffleFlashcards([1, 2, 3], () => 0).length, 3);
});
