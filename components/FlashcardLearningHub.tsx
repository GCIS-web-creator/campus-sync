'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowLeftRight, Brain, Check, ChevronRight, ClipboardCheck, CloudDownload,
  Layers3, Pencil, Play, Plus, RotateCcw, Search, Shuffle, Sparkles, Timer,
  Trash2, Trophy, Upload, WifiOff, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  calculateFlashcardReview, createFlashcardChoices, isFlashcardAnswerCorrect,
  parseFlashcardImport, shuffleFlashcards,
} from "@/lib/flashcard-learning";
import {
  clearPendingFlashcardProgress, clearPendingFlashcardSessions, getOfflineFlashcardSets,
  getPendingFlashcardProgress, getPendingFlashcardSessions, queueFlashcardProgress,
  queueFlashcardSession, saveFlashcardSetOffline,
} from "@/lib/flashcard-offline";

type SetRow = {
  id: string; user_id: string; title: string; description: string; subject: string;
  accent_color: string; is_archived: boolean; created_at: string; updated_at: string;
  last_studied_at: string | null;
};
type CardRow = {
  id: string; user_id: string; set_id: string; term: string; definition: string;
  hint: string; example: string; term_image_url: string; definition_image_url: string;
  sort_order: number;
};
type ProgressRow = {
  user_id: string; card_id: string; set_id: string; status: "new" | "learning" | "known";
  correct_count: number; incorrect_count: number; consecutive_correct: number;
  interval_days: number; ease_factor: number; next_review_at: string; last_reviewed_at: string;
  updated_at: string;
};
type DraftCard = Omit<CardRow, "user_id" | "set_id" | "sort_order">;
type Mode = "flashcards" | "learn" | "test" | "match";
type Screen = "library" | "detail" | "editor" | "test-config" | "flashcards" | "learn" | "test" | "match" | "result";
type Question = { card: CardRow; promptSide: "term" | "definition"; answer: string };
type AnswerLog = { id: string; user_id: string; session_id: string; card_id: string; prompt_side: "term" | "definition"; answer_text: string; is_correct: boolean; response_ms: number };
const SUBJECTS = ["英語", "古典探究", "国語", "数学", "物理", "化学", "生物", "公共", "情報", "保健", "その他"];
const ACCENTS: Record<string, string> = {
  blue: "from-blue-600 to-cyan-500", violet: "from-violet-600 to-fuchsia-500",
  emerald: "from-emerald-600 to-teal-500", amber: "from-amber-500 to-orange-500",
  rose: "from-rose-600 to-pink-500", cyan: "from-cyan-600 to-sky-500",
};
const DOTS: Record<string, string> = {
  blue: "bg-blue-500", violet: "bg-violet-500", emerald: "bg-emerald-500",
  amber: "bg-amber-500", rose: "bg-rose-500", cyan: "bg-cyan-500",
};
const uid = () => crypto.randomUUID();
const blankCard = (): DraftCard => ({
  id: uid(), term: "", definition: "", hint: "", example: "", term_image_url: "", definition_image_url: "",
});
const durationText = (seconds: number) => Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
const sideText = (card: CardRow, side: "term" | "definition") => side === "term" ? card.term : card.definition;

export default function FlashcardLearningHub({ userId, isDarkMode = false }: { userId: string; isDarkMode?: boolean }) {
  const dark = isDarkMode;
  const text = dark ? "text-slate-100" : "text-slate-900";
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const panel = dark ? "border-slate-700 bg-slate-900/85" : "border-slate-200 bg-white";
  const soft = dark ? "bg-slate-800" : "bg-slate-50";
  const field = dark ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";
  const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-cyan-600/15 transition hover:brightness-110 disabled:opacity-45";
  const secondary = dark ? "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-sm font-bold text-slate-100" : "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-700 hover:bg-cyan-50";
  const [screen, setScreen] = useState<Screen>("library");
  const [sets, setSets] = useState<SetRow[]>([]);
  const [cardsBySet, setCardsBySet] = useState<Record<string, CardRow[]>>({});
  const [progress, setProgress] = useState<Record<string, ProgressRow>>({});
  const [offlineIds, setOfflineIds] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("すべて");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [editSetId, setEditSetId] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("その他");
  const [description, setDescription] = useState("");
  const [accent, setAccent] = useState("blue");
  const [draftCards, setDraftCards] = useState<DraftCard[]>([blankCard()]);
  const [originalCardIds, setOriginalCardIds] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [mode, setMode] = useState<Mode>("flashcards");
  const [runCards, setRunCards] = useState<CardRow[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [flashIndex, setFlashIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [learnIndex, setLearnIndex] = useState(0);
  const [learnAnswer, setLearnAnswer] = useState("");
  const [learnReveal, setLearnReveal] = useState(false);
  const [testCount, setTestCount] = useState("10");
  const [testKind, setTestKind] = useState<"mixed" | "choice" | "written">("mixed");
  const [testDirection, setTestDirection] = useState<"both" | "term" | "definition">("both");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [testAnswer, setTestAnswer] = useState("");
  const [testReveal, setTestReveal] = useState(false);
  const [testResults, setTestResults] = useState<Array<{ question: Question; answer: string; correct: boolean }>>([]);
  const [answerLogs, setAnswerLogs] = useState<AnswerLog[]>([]);
  const [result, setResult] = useState<{ correct: number; incorrect: number; total: number; score: number; seconds: number; mode: Mode } | null>(null);
  const [matchTerms, setMatchTerms] = useState<CardRow[]>([]);
  const [matchDefinitions, setMatchDefinitions] = useState<CardRow[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedDefinition, setSelectedDefinition] = useState("");
  const [matched, setMatched] = useState<string[]>([]);
  const [matchErrors, setMatchErrors] = useState(0);
  const [matchStart, setMatchStart] = useState(0);
  const [matchSeconds, setMatchSeconds] = useState(0);
  const startedQuestionAt = useRef(0);
  const syncingRef = useRef(false);
  const finished = useRef(false);

  const selectedSet = sets.find(item => item.id === selectedSetId) || null;
  const cards = selectedSet ? (cardsBySet[selectedSet.id] || []) : [];
  const visibleSets = useMemo(() => sets.filter(item => {
    const searchMatch = !search.trim() || (item.title + " " + item.subject + " " + item.description).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return searchMatch && (subjectFilter === "すべて" || item.subject === subjectFilter) && !item.is_archived;
  }), [sets, search, subjectFilter]);
  const currentLearnCard = runCards[learnIndex];
  const currentQuestion = questions[questionIndex];
  const learnChoices = useMemo(() => currentLearnCard ? createFlashcardChoices(runCards, currentLearnCard, 4) : [], [runCards, currentLearnCard]);
  const testIsChoice = testKind === "choice" || (testKind === "mixed" && questionIndex % 2 === 0);
  const testChoices = useMemo(() => {
    if (!currentQuestion) return [];
    const answerSide = currentQuestion.promptSide === "term" ? "definition" : "term";
    const wrong = shuffleFlashcards(runCards.filter(item => item.id !== currentQuestion.card.id).map(item => sideText(item, answerSide)).filter(Boolean)).slice(0, 3);
    return shuffleFlashcards([currentQuestion.answer, ...wrong]);
  }, [currentQuestion, runCards]);

  const loadOffline = useCallback(async () => {
    const cached = await getOfflineFlashcardSets(userId);
    const mappedSets: SetRow[] = cached.map(item => ({
      id: item.id, user_id: item.user_id, title: item.title, description: item.description,
      subject: item.subject, accent_color: item.accent_color, is_archived: false,
      created_at: item.saved_at, updated_at: item.updated_at, last_studied_at: null,
    }));
    const grouped: Record<string, CardRow[]> = {};
    const progressMap: Record<string, ProgressRow> = {};
    for (const item of cached) {
      grouped[item.id] = item.cards.map(card => ({
        ...card, user_id: userId, set_id: item.id, hint: card.hint || "",
        example: card.example || "", term_image_url: card.term_image_url || "",
        definition_image_url: card.definition_image_url || "", sort_order: card.sort_order || 0,
      })) as CardRow[];
      for (const row of item.progress || []) progressMap[row.card_id] = row as ProgressRow;
    }
    const queuedProgress = await getPendingFlashcardProgress(userId);
    for (const row of queuedProgress) progressMap[row.card_id] = row as ProgressRow;
    setSets(mappedSets);
    setCardsBySet(grouped);
    setProgress(progressMap);
    setOfflineIds(cached.map(item => item.id));
    return cached.length;
  }, [userId]);

  const syncPending = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const pending = await getPendingFlashcardProgress(userId);
      if (pending.length) {
        const { error: progressError } = await supabase.from("student_flashcard_progress").upsert(pending, { onConflict: "user_id,card_id" });
        if (progressError) throw progressError;
        await clearPendingFlashcardProgress(userId, pending.map(item => item.card_id));
      }
      const sessions = await getPendingFlashcardSessions(userId);
      const done: string[] = [];
      for (const entry of sessions) {
        const { error: sessionError } = await supabase.from("student_flashcard_sessions").upsert(entry.session, { onConflict: "id" });
        if (sessionError) throw sessionError;
        if (entry.answers.length) {
          const { error: answersError } = await supabase.from("student_flashcard_session_answers").upsert(entry.answers, { onConflict: "id" });
          if (answersError) throw answersError;
        }
        done.push(String(entry.session.id));
      }
      if (done.length) await clearPendingFlashcardSessions(done);
      if (pending.length || done.length) setMessage("オフライン中の学習結果を同期しました。");
    } catch (syncError) {
      console.warn("Flashcard pending changes remain queued:", syncError);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [userId]);

  const loadCloud = useCallback(async () => {
    const { data: setData, error: setQueryError } = await supabase.from("student_flashcard_sets")
      .select("*").eq("user_id", userId).order("updated_at", { ascending: false });
    if (setQueryError) throw setQueryError;
    const setRows = (setData || []) as SetRow[];
    let cardRows: CardRow[] = [];
    let progressRows: ProgressRow[] = [];
    if (setRows.length) {
      const setIds = setRows.map(item => item.id);
      const [cardResult, progressResult] = await Promise.all([
        supabase.from("student_flashcards").select("*").eq("user_id", userId).in("set_id", setIds).order("sort_order"),
        supabase.from("student_flashcard_progress").select("*").eq("user_id", userId).in("set_id", setIds),
      ]);
      if (cardResult.error) throw cardResult.error;
      if (progressResult.error) throw progressResult.error;
      cardRows = (cardResult.data || []) as CardRow[];
      progressRows = (progressResult.data || []) as ProgressRow[];
    }
    const grouped: Record<string, CardRow[]> = {};
    for (const card of cardRows) (grouped[card.set_id] ||= []).push(card);
    const progressMap: Record<string, ProgressRow> = {};
    for (const row of progressRows) progressMap[row.card_id] = row;
    setSets(setRows);
    setCardsBySet(grouped);
    setProgress(progressMap);
    setOfflineIds((await getOfflineFlashcardSets(userId)).map(item => item.id));
    setError("");
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    if (navigator.onLine) {
      try {
        await syncPending();
        await loadCloud();
      } catch (loadError) {
        console.error("Flashcard data load failed:", loadError);
        setError(loadError instanceof Error ? loadError.message : "カードを読み込めませんでした。");
        try {
          if (!(await loadOffline())) setError("オンラインデータを読み込めず、端末にも保存済みカードがありません。");
        } catch { /* Keep the cloud error visible. */ }
      }
    } else {
      try {
        if (!(await loadOffline())) setError("オフライン保存済みのカードセットがありません。Wi-Fi接続時にセットを保存してください。");
      } catch (offlineError) {
        setError(offlineError instanceof Error ? offlineError.message : "端末内のカードを読み込めませんでした。");
      }
    }
    setLoading(false);
  }, [loadCloud, loadOffline, syncPending]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void load();
    const onOnline = () => { setOnline(true); void load(); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  useEffect(() => {
    if (screen !== "match" || !matchStart) return;
    const timer = window.setInterval(() => setMatchSeconds(Math.floor((Date.now() - matchStart) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [screen, matchStart]);

  const openEditor = (set?: SetRow) => {
    if (set) {
      setEditSetId(set.id);
      setTitle(set.title);
      setSubject(set.subject);
      setDescription(set.description || "");
      setAccent(set.accent_color || "blue");
      const oldCards = cardsBySet[set.id] || [];
      setDraftCards(oldCards.length ? oldCards.map(card => ({ ...card })) : [blankCard()]);
      setOriginalCardIds(oldCards.map(card => card.id));
    } else {
      setEditSetId("");
      setTitle("");
      setSubject("その他");
      setDescription("");
      setAccent("blue");
      setDraftCards([blankCard(), blankCard()]);
      setOriginalCardIds([]);
    }
    setMessage("");
    setScreen("editor");
  };

  const updateDraft = (id: string, patch: Partial<DraftCard>) => {
    setDraftCards(current => current.map(card => card.id === id ? { ...card, ...patch } : card));
  };

  const saveEditor = async () => {
    if (!online) { setMessage("カードの作成・編集にはオンライン接続が必要です。保存済みカードの学習はオフラインでも利用できます。"); return; }
    if (!title.trim()) { setMessage("セット名を入力してください。"); return; }
    const validCards = draftCards.filter(card => card.term.trim() && card.definition.trim());
    if (!validCards.length) { setMessage("用語と定義を入力したカードを1枚以上追加してください。"); return; }
    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim(), subject, accent_color: accent, updated_at: new Date().toISOString() };
      let saved: SetRow;
      if (editSetId) {
        const { data, error: saveError } = await supabase.from("student_flashcard_sets").update(payload)
          .eq("id", editSetId).eq("user_id", userId).select("*").single();
        if (saveError) throw saveError;
        saved = data as SetRow;
      } else {
        const { data, error: saveError } = await supabase.from("student_flashcard_sets")
          .insert({ ...payload, user_id: userId }).select("*").single();
        if (saveError) throw saveError;
        saved = data as SetRow;
      }
      const records = validCards.map((card, index) => ({
        id: card.id || uid(), user_id: userId, set_id: saved.id, term: card.term.trim(),
        definition: card.definition.trim(), hint: card.hint.trim(), example: card.example.trim(),
        term_image_url: card.term_image_url.trim(), definition_image_url: card.definition_image_url.trim(),
        sort_order: index, updated_at: new Date().toISOString(),
      }));
      const keep = new Set(records.map(card => card.id));
      const removeIds = originalCardIds.filter(id => !keep.has(id));
      const { error: cardsError } = await supabase.from("student_flashcards").upsert(records, { onConflict: "id" });
      if (cardsError) throw cardsError;
      if (removeIds.length) {
        const { error: deleteError } = await supabase.from("student_flashcards").delete()
          .eq("user_id", userId).eq("set_id", saved.id).in("id", removeIds);
        if (deleteError) throw deleteError;
      }
      setSelectedSetId(saved.id);
      await loadCloud();
      setScreen("detail");
      setMessage("カードセットを保存しました。");
    } catch (saveError) {
      console.error("Flashcard editor save failed:", saveError);
      setMessage(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const importCards = () => {
    const rows = parseFlashcardImport(importText);
    if (!rows.length) { setMessage("用語と定義を区切った2列のデータが見つかりませんでした。"); return; }
    setDraftCards(current => [...current.filter(card => card.term.trim() || card.definition.trim()), ...rows.map(row => ({ ...blankCard(), term: row.term, definition: row.definition }))]);
    setImportText("");
    setShowImport(false);
    setMessage(rows.length + "枚のカードを追加しました。セットを保存してください。");
  };

  const saveOffline = async () => {
    if (!selectedSet) return;
    try {
      await saveFlashcardSetOffline({
        id: selectedSet.id, user_id: userId, title: selectedSet.title, description: selectedSet.description,
        subject: selectedSet.subject, accent_color: selectedSet.accent_color, updated_at: selectedSet.updated_at,
        cards: cards.map(({ id, term, definition, hint, example, term_image_url, definition_image_url, sort_order }) => ({
          id, term, definition, hint, example, term_image_url, definition_image_url, sort_order,
        })),
        progress: cards.map(card => progress[card.id] || {
          user_id: userId, card_id: card.id, set_id: selectedSet.id, status: "new",
          correct_count: 0, incorrect_count: 0, consecutive_correct: 0, interval_days: 0,
          ease_factor: 2.5, next_review_at: "", last_reviewed_at: "", updated_at: new Date().toISOString(),
        }),
      });
      setOfflineIds(current => Array.from(new Set([...current, selectedSet.id])));
      setMessage("このセットを端末に保存しました。オフラインでも学習できます。");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "端末への保存に失敗しました。");
    }
  };

  const recordProgress = async (card: CardRow, correct: boolean) => {
    const next = calculateFlashcardReview(progress[card.id], correct);
    const row: ProgressRow = { user_id: userId, card_id: card.id, set_id: card.set_id, ...next };
    setProgress(current => ({ ...current, [card.id]: row }));
    if (navigator.onLine) {
      const { error: saveError } = await supabase.from("student_flashcard_progress").upsert(row, { onConflict: "user_id,card_id" });
      if (saveError) await queueFlashcardProgress(row);
    } else {
      await queueFlashcardProgress(row);
    }
  };

  const finishSession = async (answers: AnswerLog[], stats?: { correct: number; incorrect: number; total: number }) => {
    if (finished.current || !selectedSet) return;
    finished.current = true;
    const correct = stats?.correct ?? answers.filter(item => item.is_correct).length;
    const total = stats?.total ?? answers.length;
    const incorrect = stats?.incorrect ?? Math.max(0, total - correct);
    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const sessionId = uid();
    const completedAt = new Date().toISOString();
    const session = {
      id: sessionId, user_id: userId, set_id: selectedSet.id, mode,
      card_count: total, correct_count: correct, incorrect_count: incorrect,
      duration_seconds: seconds, score_percent: total ? Math.round((correct / total) * 10000) / 100 : 0,
      details: { response_count: answers.length }, started_at: new Date(startedAt || Date.now()).toISOString(), completed_at: completedAt,
    };
    const answerRows = answers.map(item => ({ ...item, session_id: sessionId }));
    try {
      if (!navigator.onLine) throw new Error("offline");
      const { error: sessionError } = await supabase.from("student_flashcard_sessions").upsert(session, { onConflict: "id" });
      if (sessionError) throw sessionError;
      if (answerRows.length) {
        const { error: answerError } = await supabase.from("student_flashcard_session_answers").upsert(answerRows, { onConflict: "id" });
        if (answerError) throw answerError;
      }
      await supabase.from("student_flashcard_sets").update({ last_studied_at: completedAt }).eq("id", selectedSet.id).eq("user_id", userId);
    } catch {
      await queueFlashcardSession({ user_id: userId, session, answers: answerRows, queued_at: completedAt });
      setMessage("学習結果を端末に保存しました。接続復帰時に同期します。");
    }
    setResult({ correct, incorrect, total, score: total ? Math.round(correct / total * 100) : 0, seconds, mode });
    setScreen("result");
  };

  const startFlashcards = (shuffle = true) => {
    if (!cards.length) return;
    setMode("flashcards"); setRunCards(shuffle ? shuffleFlashcards(cards) : [...cards]);
    setStartedAt(Date.now()); finished.current = false; setAnswerLogs([]);
    setFlashIndex(0); setFlipped(false); setReverse(false); setScreen("flashcards");
  };

  const startLearn = () => {
    if (!cards.length) return;
    const due = cards.filter(card => !progress[card.id]?.next_review_at || new Date(progress[card.id].next_review_at).getTime() <= Date.now());
    setMode("learn"); setRunCards(shuffleFlashcards(due.length ? due : cards));
    setStartedAt(Date.now()); finished.current = false; setAnswerLogs([]);
    setLearnIndex(0); setLearnAnswer(""); setLearnReveal(false); setScreen("learn");
  };

  const startTest = () => {
    if (!cards.length) return;
    const count = testCount === "all" ? cards.length : Math.min(cards.length, Number(testCount));
    const chosen = shuffleFlashcards(cards).slice(0, count);
    setQuestions(chosen.map((card, index) => {
      const promptSide = testDirection === "term" ? "term" : testDirection === "definition" ? "definition" : index % 2 === 0 ? "term" : "definition";
      return { card, promptSide, answer: promptSide === "term" ? card.definition : card.term };
    }));
    setMode("test"); setRunCards(cards); setStartedAt(Date.now()); finished.current = false; setAnswerLogs([]);
    setQuestionIndex(0); setTestAnswer(""); setTestReveal(false); setTestResults([]);
    startedQuestionAt.current = Date.now(); setScreen("test");
  };

  const startMatch = () => {
    if (!cards.length) return;
    const chosen = shuffleFlashcards(cards).slice(0, Math.min(8, cards.length));
    setMode("match"); setRunCards(chosen); setStartedAt(Date.now()); finished.current = false; setAnswerLogs([]);
    setMatchTerms(shuffleFlashcards(chosen));
    setMatchDefinitions(shuffleFlashcards(chosen));
    setSelectedTerm(""); setSelectedDefinition(""); setMatched([]); setMatchErrors(0);
    setMatchStart(Date.now()); setMatchSeconds(0); setScreen("match");
  };

  const markFlashcard = async (correct: boolean) => {
    const card = runCards[flashIndex];
    if (!card) return;
    await recordProgress(card, correct);
    const answer: AnswerLog = {
      id: uid(), user_id: userId, session_id: "", card_id: card.id,
      prompt_side: reverse ? "definition" : "term", answer_text: correct ? "覚えた" : "もう一度",
      is_correct: correct, response_ms: 0,
    };
    const next = [...answerLogs, answer];
    setAnswerLogs(next);
    if (flashIndex + 1 >= runCards.length) await finishSession(next);
    else { setFlashIndex(value => value + 1); setFlipped(false); }
  };

  const submitLearn = async (answer: string, forcedCorrect?: boolean) => {
    if (!currentLearnCard || learnReveal) return;
    const correct = forcedCorrect ?? isFlashcardAnswerCorrect(answer, currentLearnCard.definition);
    setLearnAnswer(answer); setLearnReveal(true);
    await recordProgress(currentLearnCard, correct);
    setAnswerLogs(current => [...current, {
      id: uid(), user_id: userId, session_id: "", card_id: currentLearnCard.id,
      prompt_side: "term", answer_text: answer, is_correct: correct, response_ms: 0,
    }]);
  };

  const nextLearn = async () => {
    const latest = answerLogs;
    if (learnIndex + 1 >= runCards.length) await finishSession(latest);
    else { setLearnIndex(value => value + 1); setLearnAnswer(""); setLearnReveal(false); }
  };

  const submitTest = async (answer: string) => {
    if (!currentQuestion || testReveal) return;
    const correct = isFlashcardAnswerCorrect(answer, currentQuestion.answer);
    setTestAnswer(answer); setTestReveal(true);
    await recordProgress(currentQuestion.card, correct);
    setTestResults(current => [...current, { question: currentQuestion, answer, correct }]);
    setAnswerLogs(current => [...current, {
      id: uid(), user_id: userId, session_id: "", card_id: currentQuestion.card.id,
      prompt_side: currentQuestion.promptSide, answer_text: answer, is_correct: correct,
      response_ms: Math.max(0, Date.now() - startedQuestionAt.current),
    }]);
  };

  const nextTest = async () => {
    if (questionIndex + 1 >= questions.length) {
      const answers = answerLogs;
      const correct = testResults.filter(item => item.correct).length;
      await finishSession(answers, { correct, incorrect: testResults.length - correct, total: testResults.length });
    } else {
      setQuestionIndex(value => value + 1); setTestAnswer(""); setTestReveal(false);
      startedQuestionAt.current = Date.now();
    }
  };

  const resolveMatch = (termId: string, definitionId: string) => {
    if (!termId || !definitionId) return;
    if (termId === definitionId) {
      const next = [...matched, termId];
      setMatched(next);
      const card = runCards.find(item => item.id === termId);
      if (card) {
        void recordProgress(card, true);
        setAnswerLogs(current => [...current, {
          id: uid(), user_id: userId, session_id: "", card_id: card.id,
          prompt_side: "term", answer_text: "ペア正解", is_correct: true, response_ms: 0,
        }]);
      }
      setSelectedTerm(""); setSelectedDefinition("");
      if (next.length === runCards.length) {
        const finalLogs = runCards.map(card => ({
          id: uid(), user_id: userId, session_id: "", card_id: card.id,
          prompt_side: "term" as const, answer_text: "ペア正解", is_correct: true, response_ms: 0,
        }));
        void finishSession(finalLogs, { correct: runCards.length, incorrect: matchErrors, total: runCards.length + matchErrors });
      }
    } else {
      setMatchErrors(value => value + 1);
      setSelectedTerm(""); setSelectedDefinition("");
    }
  };

  const goBack = () => { setMessage(""); setScreen(selectedSet ? "detail" : "library"); };

  const renderLibrary = () => (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 p-5 text-white shadow-xl sm:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full border-[28px] border-white/10"/>
        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="flex items-center gap-2 text-[10px] font-black tracking-[0.22em] text-cyan-100"><Sparkles size={14}/> CAMPUSSYNC STUDY CARDS</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">覚えるを、もっと自分らしく。</h1>
            <p className="mt-2 text-sm leading-6 text-blue-50">カードを作って、めくって、テストして、マッチで挑戦。学習履歴から苦手なカードを見つけて復習できます。</p>
          </div>
          <button type="button" onClick={() => openEditor()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-blue-700 shadow-lg"><Plus size={17}/> 新しいセットを作成</button>
        </div>
        <div className="relative z-10 mt-6 grid max-w-md grid-cols-3 gap-2">
          {[{label:"セット",value:sets.length},{label:"カード",value:Object.values(cardsBySet).reduce((sum, list) => sum + list.length, 0)},{label:"習得済み",value:Object.values(progress).filter(item => item.status === "known").length}].map(item => (
            <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5"><p className="text-[10px] font-bold text-blue-100">{item.label}</p><p className="mt-1 text-xl font-black tabular-nums">{item.value}</p></div>
          ))}
        </div>
      </section>
      {!online && <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"><WifiOff size={18} className="mt-0.5 shrink-0"/><div><p className="text-sm font-black">オフラインモード</p><p className="mt-0.5 text-xs leading-5">端末に保存済みのセットだけ表示しています。学習結果は端末に保存し、接続復帰時に同期します。</p></div></div>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className={"flex flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 " + field}><Search size={17} className={muted}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="セット名・教科で検索" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/>{search && <button type="button" onClick={() => setSearch("")} aria-label="検索をクリア"><X size={15}/></button>}</label>
        <select value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)} className={"rounded-xl border px-3 py-2.5 text-sm font-bold outline-none " + field}><option>すべて</option>{SUBJECTS.map(item => <option key={item}>{item}</option>)}</select>
      </div>
      {loading ? <div className={"rounded-2xl border p-10 text-center " + panel}><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"/><p className={"mt-3 text-sm font-bold " + muted}>カードセットを読み込んでいます…</p></div> :
        visibleSets.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleSets.map(set => {
          const list = cardsBySet[set.id] || [];
          const known = list.filter(card => progress[card.id]?.status === "known").length;
          const percent = list.length ? Math.round(known / list.length * 100) : 0;
          return <button key={set.id} type="button" onClick={() => {setSelectedSetId(set.id);setScreen("detail");}} className={"overflow-hidden rounded-2xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg " + panel}>
            <div className={"h-2 bg-gradient-to-r " + (ACCENTS[set.accent_color] || ACCENTS.blue)}/>
            <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={"inline-flex rounded-full px-2 py-1 text-[10px] font-black " + (dark ? "bg-slate-800 text-cyan-300" : "bg-cyan-50 text-cyan-800")}>{set.subject}</span><h3 className={"mt-2 line-clamp-2 text-base font-black " + text}>{set.title}</h3><p className={"mt-1 line-clamp-2 min-h-9 text-xs leading-5 " + muted}>{set.description || "説明はまだありません。"}</p></div><span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white " + (DOTS[set.accent_color] || DOTS.blue)}><Layers3 size={20}/></span></div><div className="mt-4 flex justify-between text-xs"><span className={muted}>{list.length}枚のカード</span><span className="font-black text-emerald-500">{known}枚習得</span></div><div className={"mt-2 h-1.5 overflow-hidden rounded-full " + (dark ? "bg-slate-700" : "bg-slate-100")}><div className="h-full rounded-full bg-emerald-500" style={{width:percent + "%"}}/></div><div className="mt-3 flex items-center justify-between"><span className={"text-[10px] " + muted}>{offlineIds.includes(set.id) ? "✓ オフライン保存済み" : "習得率 " + percent + "%"}</span><span className="text-xs font-black text-cyan-500">セットを開く <ChevronRight size={14} className="inline"/></span></div></div>
          </button>;
        })}</div> :
        <div className={"rounded-2xl border border-dashed p-8 text-center sm:p-12 " + panel}><div className={"mx-auto flex h-14 w-14 items-center justify-center rounded-2xl " + soft}><Layers3 size={27} className="text-cyan-500"/></div><h3 className={"mt-4 text-lg font-black " + text}>{sets.length ? "該当するセットがありません" : "最初のカードセットを作ろう"}</h3><p className={"mx-auto mt-2 max-w-md text-sm leading-6 " + muted}>{sets.length ? "検索語や教科フィルターを変更してください。" : "英単語・古典単語・理科用語など、覚えたい内容を自由に登録できます。"}</p>{!sets.length && <button type="button" onClick={() => openEditor()} className={primary + " mt-5"}><Plus size={16}/> カードセットを作成</button>}</div>}
    </div>
  );

  const renderDetail = () => selectedSet && (
    <div className="space-y-5">
      <button type="button" onClick={() => setScreen("library")} className={"inline-flex items-center gap-1 text-sm font-bold " + muted}><ArrowLeft size={16}/> すべてのセット</button>
      <section className={"overflow-hidden rounded-[26px] border shadow-sm " + panel}>
        <div className={"bg-gradient-to-r p-5 text-white sm:p-7 " + (ACCENTS[selectedSet.accent_color] || ACCENTS.blue)}><span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[10px] font-black">{selectedSet.subject}</span><h1 className="mt-3 break-words text-2xl font-black sm:text-3xl">{selectedSet.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">{selectedSet.description || "このセットの説明はまだありません。"}</p><p className="mt-4 text-xs font-bold text-white/80">{cards.length}枚のカード ・ {cards.filter(card => progress[card.id]?.status === "known").length}枚を習得済み</p></div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:p-4">
          {[{id:"flashcards" as const,label:"カード",desc:"めくって覚える",icon:Layers3,cls:"text-blue-500"},{id:"learn" as const,label:"学習",desc:"問題を解いて定着",icon:Brain,cls:"text-violet-500"},{id:"test" as const,label:"テスト",desc:"理解度をチェック",icon:ClipboardCheck,cls:"text-emerald-500"},{id:"match" as const,label:"マッチ",desc:"用語と定義をペアに",icon:Timer,cls:"text-amber-500"}].map(item => {const Icon=item.icon;return <button key={item.id} type="button" disabled={!cards.length} onClick={() => {if(item.id==="flashcards")startFlashcards();if(item.id==="learn")startLearn();if(item.id==="test")setScreen("test-config");if(item.id==="match")startMatch();}} className={"flex min-h-28 flex-col items-start rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40 " + (dark ? "border-slate-700 bg-slate-800/70" : "border-slate-200 bg-slate-50")}><Icon size={22} className={item.cls}/><span className={"mt-2 text-sm font-black " + text}>{item.label}</span><span className={"mt-1 text-[10px] leading-4 " + muted}>{item.desc}</span></button>;})}
        </div>
      </section>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => openEditor(selectedSet)} className={secondary}><Pencil size={15}/> 編集</button><button type="button" onClick={() => void saveOffline()} disabled={!online || !cards.length} className={secondary}><CloudDownload size={15}/>{offlineIds.includes(selectedSet.id) ? "再保存" : "オフラインに保存"}</button><button type="button" onClick={() => startFlashcards()} disabled={!cards.length} className={secondary}><Shuffle size={15}/> シャッフル</button></div>
      <section className={"overflow-hidden rounded-2xl border " + panel}><div className="flex items-center justify-between border-b border-inherit p-4"><div><h2 className={"font-black " + text}>カード一覧</h2><p className={"mt-1 text-xs " + muted}>用語と定義を確認できます。</p></div><span className={"text-xs font-bold " + muted}>{cards.length}枚</span></div><div className="divide-y divide-slate-200/70 dark:divide-slate-700">{cards.map((card,index) => {const status=progress[card.id]?.status || "new";return <div key={card.id} className="grid gap-2 p-4 sm:grid-cols-[2.5rem_1fr_1fr_auto] sm:items-center"><span className={"flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black " + soft + " " + muted}>{index+1}</span><div className="min-w-0"><p className={"text-[10px] font-bold " + muted}>用語</p><p className={"break-words text-sm font-black " + text}>{card.term}</p></div><div className="min-w-0"><p className={"text-[10px] font-bold " + muted}>定義</p><p className={"break-words text-sm " + text}>{card.definition}</p></div><span className={"w-fit rounded-full px-2 py-1 text-[10px] font-black " + (status==="known"?"bg-emerald-500/10 text-emerald-500":status==="learning"?"bg-amber-500/10 text-amber-500":dark?"bg-slate-700 text-slate-300":"bg-slate-100 text-slate-500")}>{status==="known"?"習得済み":status==="learning"?"学習中":"未学習"}</span></div>;})}{!cards.length && <div className={"p-8 text-center text-sm " + muted}>カードがまだありません。編集から追加してください。</div>}</div></section>
    </div>
  );

  const renderEditor = () => (
    <div className="space-y-4">
      <button type="button" onClick={goBack} className={"inline-flex items-center gap-1 text-sm font-bold " + muted}><ArrowLeft size={16}/> 戻る</button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-black tracking-[0.2em] text-cyan-500">SET EDITOR</p><h1 className={"mt-1 text-2xl font-black " + text}>{editSetId ? "セットを編集" : "新しいセットを作成"}</h1><p className={"mt-1 text-sm " + muted}>用語と定義を入力。何枚でも追加できます。</p></div><button type="button" onClick={() => setShowImport(value => !value)} className={secondary}><Upload size={15}/> 一括取り込み</button></div>
      <section className={"rounded-2xl border p-4 sm:p-5 " + panel}><div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className={"mb-1.5 block text-xs font-black " + muted}>セット名 *</span><input value={title} onChange={event=>setTitle(event.target.value)} maxLength={120} placeholder="例：英単語 2学期期末" className={"w-full rounded-xl border px-3 py-3 text-sm outline-none " + field}/></label>
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>教科</span><select value={subject} onChange={event=>setSubject(event.target.value)} className={"w-full rounded-xl border px-3 py-3 text-sm outline-none " + field}>{SUBJECTS.map(item=><option key={item}>{item}</option>)}</select></label>
        <div><span className={"mb-1.5 block text-xs font-black " + muted}>カラー</span><div className="flex h-[46px] items-center gap-3">{Object.keys(DOTS).map(color=><button key={color} type="button" onClick={()=>setAccent(color)} aria-label={color} className={"h-7 w-7 rounded-full " + DOTS[color] + (accent===color?" ring-2 ring-cyan-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900":"")}/>)}</div></div>
        <label className="block sm:col-span-2"><span className={"mb-1.5 block text-xs font-black " + muted}>説明（任意）</span><textarea value={description} onChange={event=>setDescription(event.target.value)} maxLength={1000} rows={2} placeholder="テスト範囲、単元、覚えたい内容など" className={"w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none " + field}/></label>
      </div></section>
      {showImport && <section className={"rounded-2xl border p-4 " + panel}><div className="flex items-center justify-between"><h3 className={"font-black " + text}>カードを一括取り込み</h3><button type="button" onClick={()=>setShowImport(false)} aria-label="閉じる"><X size={17}/></button></div><p className={"mt-1 text-xs leading-5 " + muted}>1行につき1枚。用語と定義をタブ・カンマ・｜・::で区切ります。</p><textarea value={importText} onChange={event=>setImportText(event.target.value)} rows={6} placeholder={"apple    りんご\nbook    本\nreluctant,気が進まない"} className={"mt-3 w-full rounded-xl border p-3 font-mono text-xs outline-none " + field}/><div className="mt-2 flex justify-end"><button type="button" onClick={importCards} className={primary}>取り込む</button></div></section>}
      <div className="flex items-center justify-between gap-3"><div><h2 className={"font-black " + text}>カード</h2><p className={"text-xs " + muted}>{draftCards.length}枚（用語と定義があるカードのみ保存）</p></div><button type="button" onClick={()=>setDraftCards(current=>[...current,blankCard()])} className={secondary}><Plus size={15}/> カードを追加</button></div>
      <div className="space-y-3">{draftCards.map((card,index)=><section key={card.id} className={"rounded-2xl border p-3 sm:p-4 " + panel}><div className="mb-3 flex items-center justify-between"><span className={"text-xs font-black " + muted}>CARD {String(index+1).padStart(2,"0")}</span><button type="button" onClick={()=>setDraftCards(current=>current.length>1?current.filter(item=>item.id!==card.id):[blankCard()])} aria-label="カードを削除" className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"><Trash2 size={16}/></button></div><div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>用語・問題 *</span><textarea rows={3} value={card.term} onChange={event=>updateDraft(card.id,{term:event.target.value})} placeholder="例：ubiquitous" className={"w-full resize-y rounded-xl border p-3 text-sm outline-none " + field}/></label>
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>定義・答え *</span><textarea rows={3} value={card.definition} onChange={event=>updateDraft(card.id,{definition:event.target.value})} placeholder="例：至る所に存在する" className={"w-full resize-y rounded-xl border p-3 text-sm outline-none " + field}/></label>
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>ヒント</span><input value={card.hint} onChange={event=>updateDraft(card.id,{hint:event.target.value})} placeholder="思い出すための手がかり" className={"w-full rounded-xl border px-3 py-2.5 text-sm outline-none " + field}/></label>
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>例文・補足</span><input value={card.example} onChange={event=>updateDraft(card.id,{example:event.target.value})} placeholder="用例、覚え方、関連事項" className={"w-full rounded-xl border px-3 py-2.5 text-sm outline-none " + field}/></label>
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>用語側の画像URL</span><input value={card.term_image_url} onChange={event=>updateDraft(card.id,{term_image_url:event.target.value})} placeholder="https://..." className={"w-full rounded-xl border px-3 py-2.5 text-sm outline-none " + field}/></label>
        <label className="block"><span className={"mb-1.5 block text-xs font-black " + muted}>定義側の画像URL</span><input value={card.definition_image_url} onChange={event=>updateDraft(card.id,{definition_image_url:event.target.value})} placeholder="https://..." className={"w-full rounded-xl border px-3 py-2.5 text-sm outline-none " + field}/></label>
      </div></section>)}</div>
      <div className="sticky bottom-2 z-10 flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white/90 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-950/90 sm:flex-row sm:justify-end"><button type="button" onClick={goBack} className={secondary}>キャンセル</button><button type="button" onClick={()=>void saveEditor()} disabled={saving||!online} className={primary}>{saving?"保存中…":"セットを保存"}</button></div>
    </div>
  );

  const renderFlashcards = () => {
    const card = runCards[flashIndex];
    if (!card) return null;
    const front = reverse ? card.definition : card.term;
    const back = reverse ? card.term : card.definition;
    return <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between"><button type="button" onClick={()=>setScreen("detail")} className={"inline-flex items-center gap-1 text-sm font-bold " + muted}><ArrowLeft size={16}/> セットに戻る</button><button type="button" onClick={()=>setReverse(value=>!value)} className={secondary}><ArrowLeftRight size={15}/> 表裏を入れ替え</button></div>
      <div className="flex items-center justify-between"><span className="text-xs font-black text-blue-500">FLASHCARDS</span><span className={"text-sm font-black tabular-nums " + text}>{flashIndex+1} / {runCards.length}</span></div>
      <div className={"h-1.5 overflow-hidden rounded-full " + soft}><div className="h-full rounded-full bg-cyan-500" style={{width:((flashIndex+1)/runCards.length*100)+"%"}}/></div>
      <button type="button" onClick={()=>setFlipped(value=>!value)} className={"flex min-h-[350px] w-full flex-col items-center justify-center rounded-[30px] border p-7 text-center shadow-xl transition hover:-translate-y-0.5 sm:min-h-[420px] " + (dark?"border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800 text-white":"border-slate-200 bg-gradient-to-br from-white to-cyan-50 text-slate-900")}>
        <span className={"rounded-full px-3 py-1 text-[10px] font-black tracking-wider " + (dark?"bg-slate-700 text-cyan-200":"bg-cyan-100 text-cyan-800")}>{flipped?"ANSWER / 定義":"QUESTION / 用語"}</span>
        {flipped ? <>{card.definition_image_url&&<img src={card.definition_image_url} alt="" className="mt-5 max-h-36 max-w-full rounded-xl object-contain"/>}<p className="mt-6 whitespace-pre-wrap break-words text-xl font-bold leading-relaxed sm:text-3xl">{back}</p>{card.hint&&<p className={"mt-4 text-xs "+muted}>ヒント：{card.hint}</p>}{card.example&&<p className={"mt-3 max-w-xl text-xs leading-5 "+muted}>{card.example}</p>}</> : <>{card.term_image_url&&<img src={card.term_image_url} alt="" className="mt-5 max-h-36 max-w-full rounded-xl object-contain"/>}<p className="mt-6 whitespace-pre-wrap break-words text-2xl font-black leading-relaxed sm:text-4xl">{front}</p><p className={"mt-8 text-xs font-bold "+muted}>タップして答えを表示</p></>}
      </button>
      {flipped?<div className="grid grid-cols-2 gap-3"><button type="button" onClick={()=>void markFlashcard(false)} className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-4 text-sm font-black text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><RotateCcw size={18} className="mx-auto mb-1"/> もう一度</button><button type="button" onClick={()=>void markFlashcard(true)} className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><Check size={18} className="mx-auto mb-1"/> 覚えた</button></div>:<button type="button" onClick={()=>setFlipped(true)} className={primary+" w-full py-4"}>答えを見る</button>}
      <p className={"text-center text-[11px] "+muted}>回答結果に応じて復習間隔を自動調整します。</p>
    </div>;
  };

  const renderLearn = () => currentLearnCard && <div className="mx-auto max-w-2xl space-y-5">
    <div className="flex items-center justify-between"><button type="button" onClick={()=>setScreen("detail")} className={"inline-flex items-center gap-1 text-sm font-bold "+muted}><ArrowLeft size={16}/> 戻る</button><span className="text-xs font-black text-violet-500">LEARN MODE　{learnIndex+1}/{runCards.length}</span></div>
    <div className={"h-1.5 overflow-hidden rounded-full "+soft}><div className="h-full rounded-full bg-violet-500" style={{width:((learnIndex+1)/runCards.length*100)+"%"}}/></div>
    <section className={"rounded-[26px] border p-5 sm:p-7 "+panel}><p className={"text-center text-[10px] font-black "+muted}>次の定義を選んでください</p><p className={"mt-6 whitespace-pre-wrap break-words text-center text-2xl font-black leading-relaxed sm:text-3xl "+text}>{currentLearnCard.term}</p>{currentLearnCard.hint&&<p className={"mt-3 text-center text-xs "+muted}>ヒント：{currentLearnCard.hint}</p>}
      {!learnReveal?(learnChoices.length>1?<div className="mt-7 grid gap-2">{learnChoices.map(option=><button key={option.id} type="button" onClick={()=>void submitLearn(option.text,option.correct)} className={"rounded-xl border p-3 text-left text-sm font-bold transition "+(dark?"border-slate-700 bg-slate-800 hover:border-violet-500":"border-slate-200 bg-slate-50 hover:border-violet-400 hover:bg-violet-50")+" "+text}>{option.text}</button>)}</div>:<form className="mt-7 space-y-3" onSubmit={event=>{event.preventDefault();void submitLearn(learnAnswer);}}><input value={learnAnswer} onChange={event=>setLearnAnswer(event.target.value)} placeholder="答えを入力…" className={"w-full rounded-xl border px-4 py-3 text-sm outline-none "+field}/><button type="submit" disabled={!learnAnswer.trim()} className={primary+" w-full"}>答え合わせ</button></form>):<div className="mt-7 space-y-4"><div className={"rounded-2xl p-4 "+(answerLogs[answerLogs.length-1]?.is_correct?"bg-emerald-500/10":"bg-rose-500/10")}><p className={"text-center text-sm font-black "+(answerLogs[answerLogs.length-1]?.is_correct?"text-emerald-500":"text-rose-500")}>{answerLogs[answerLogs.length-1]?.is_correct?"正解！":"もう一度復習しよう"}</p><p className={"mt-2 text-center text-lg font-black "+text}>{currentLearnCard.definition}</p>{currentLearnCard.example&&<p className={"mt-2 text-center text-xs "+muted}>{currentLearnCard.example}</p>}</div><button type="button" onClick={()=>{if(learnIndex+1>=runCards.length)void finishSession(answerLogs);else{setLearnIndex(value=>value+1);setLearnAnswer("");setLearnReveal(false);}}} className={primary+" w-full"}>{learnIndex+1>=runCards.length?"結果を見る":"次の問題"} <ChevronRight size={16}/></button></div>}
    </section>
  </div>;

  const renderTestConfig = () => <div className="mx-auto max-w-xl space-y-5">
    <button type="button" onClick={()=>setScreen("detail")} className={"inline-flex items-center gap-1 text-sm font-bold "+muted}><ArrowLeft size={16}/> 戻る</button>
    <section className={"rounded-[26px] border p-5 sm:p-7 "+panel}><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500"><ClipboardCheck size={25}/></div><h1 className={"mt-4 text-2xl font-black "+text}>テストを設定</h1><p className={"mt-1 text-sm "+muted}>出題数・問題形式・出題方向を選びます。</p>
      <div className="mt-6 space-y-5"><div><p className={"mb-2 text-xs font-black "+muted}>出題数</p><div className="grid grid-cols-4 gap-2">{["5","10","20","all"].map(item=><button key={item} type="button" onClick={()=>setTestCount(item)} className={"rounded-xl border px-2 py-3 text-sm font-black "+(testCount===item?"border-emerald-500 bg-emerald-500/10 text-emerald-500":dark?"border-slate-700 text-slate-300":"border-slate-200 text-slate-600")}>{item==="all"?"全部":item+"問"}</button>)}</div></div>
      <div><p className={"mb-2 text-xs font-black "+muted}>問題形式</p><div className="grid grid-cols-3 gap-2">{[{id:"mixed",label:"ミックス"},{id:"choice",label:"選択式"},{id:"written",label:"記述式"}].map(item=><button key={item.id} type="button" onClick={()=>setTestKind(item.id as typeof testKind)} className={"rounded-xl border px-2 py-3 text-xs font-black "+(testKind===item.id?"border-emerald-500 bg-emerald-500/10 text-emerald-500":dark?"border-slate-700 text-slate-300":"border-slate-200 text-slate-600")}>{item.label}</button>)}</div></div>
      <div><p className={"mb-2 text-xs font-black "+muted}>出題方向</p><div className="grid grid-cols-3 gap-2">{[{id:"both",label:"両方向"},{id:"term",label:"用語 → 定義"},{id:"definition",label:"定義 → 用語"}].map(item=><button key={item.id} type="button" onClick={()=>setTestDirection(item.id as typeof testDirection)} className={"rounded-xl border px-2 py-3 text-xs font-black "+(testDirection===item.id?"border-emerald-500 bg-emerald-500/10 text-emerald-500":dark?"border-slate-700 text-slate-300":"border-slate-200 text-slate-600")}>{item.label}</button>)}</div></div></div>
      <button type="button" onClick={startTest} disabled={!cards.length} className={primary+" mt-7 w-full py-3.5"}>テストを開始 <Play size={16}/></button>
    </section>
  </div>;

  const renderTest = () => currentQuestion && <div className="mx-auto max-w-2xl space-y-5">
    <div className="flex items-center justify-between"><button type="button" onClick={()=>setScreen("detail")} className={"inline-flex items-center gap-1 text-sm font-bold "+muted}><ArrowLeft size={16}/> 中断して戻る</button><span className="text-xs font-black text-emerald-500">TEST　{questionIndex+1}/{questions.length}</span></div>
    <div className={"h-1.5 overflow-hidden rounded-full "+soft}><div className="h-full rounded-full bg-emerald-500" style={{width:((questionIndex+1)/questions.length*100)+"%"}}/></div>
    <section className={"rounded-[26px] border p-5 sm:p-7 "+panel}><p className={"text-center text-[10px] font-black "+muted}>{currentQuestion.promptSide==="term"?"用語の定義を答えてください":"定義に合う用語を答えてください"}</p><p className={"mt-5 whitespace-pre-wrap break-words text-center text-2xl font-black leading-relaxed sm:text-3xl "+text}>{sideText(currentQuestion.card,currentQuestion.promptSide)}</p>
      {!testReveal?(testIsChoice&&testChoices.length>1?<div className="mt-7 grid gap-2">{testChoices.map((choice,index)=><button key={choice+index} type="button" onClick={()=>void submitTest(choice)} className={"rounded-xl border p-3 text-left text-sm font-bold "+(dark?"border-slate-700 bg-slate-800 hover:border-emerald-500":"border-slate-200 bg-slate-50 hover:border-emerald-400")+" "+text}><span className={"mr-3 inline-flex h-6 w-6 items-center justify-center rounded-lg text-[10px] "+soft}>{String.fromCharCode(65+index)}</span>{choice}</button>)}</div>:<form className="mt-7 space-y-3" onSubmit={event=>{event.preventDefault();void submitTest(testAnswer);}}><input value={testAnswer} onChange={event=>setTestAnswer(event.target.value)} placeholder="答えを入力…" className={"w-full rounded-xl border px-4 py-3 text-sm outline-none "+field}/><button type="submit" disabled={!testAnswer.trim()} className={primary+" w-full"}>回答する</button></form>):<div className="mt-7 space-y-4"><div className={"rounded-2xl p-4 "+(testResults[testResults.length-1]?.correct?"bg-emerald-500/10":"bg-rose-500/10")}><p className={"text-center font-black "+(testResults[testResults.length-1]?.correct?"text-emerald-500":"text-rose-500")}>{testResults[testResults.length-1]?.correct?"正解":"不正解"}</p><p className={"mt-2 text-center text-sm "+muted}>正解：<strong className={text}>{currentQuestion.answer}</strong></p></div><button type="button" onClick={()=>{if(questionIndex+1>=questions.length){const correct=testResults.filter(item=>item.correct).length;void finishSession(answerLogs,{correct,incorrect:testResults.length-correct,total:testResults.length});}else{setQuestionIndex(value=>value+1);setTestAnswer("");setTestReveal(false);startedQuestionAt.current=Date.now();}}} className={primary+" w-full"}>{questionIndex+1>=questions.length?"結果を見る":"次の問題"} <ChevronRight size={16}/></button></div>}
    </section>
  </div>;

  const renderMatch = () => <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex items-center justify-between"><button type="button" onClick={()=>setScreen("detail")} className={"inline-flex items-center gap-1 text-sm font-bold "+muted}><ArrowLeft size={16}/> セットに戻る</button><div className={"flex items-center gap-3 text-xs font-black "+text}><span><Timer size={14} className="mr-1 inline"/>{durationText(matchSeconds)}</span><span className={muted}>ミス {matchErrors}</span></div></div>
    <section className={"rounded-[26px] border p-4 sm:p-6 "+panel}><div className="text-center"><p className="text-[10px] font-black tracking-[0.2em] text-amber-500">MATCH CHALLENGE</p><h1 className={"mt-2 text-xl font-black "+text}>用語と定義をペアにしよう</h1><p className={"mt-1 text-xs "+muted}>左から用語、右から定義を選択します。</p></div><div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3"><div className="space-y-2">{matchTerms.map(card=><button key={card.id} type="button" disabled={matched.includes(card.id)} onClick={()=>{setSelectedTerm(card.id);if(selectedDefinition)resolveMatch(card.id,selectedDefinition);}} className={"min-h-16 w-full rounded-xl border p-3 text-left text-xs font-bold leading-5 sm:text-sm "+(matched.includes(card.id)?"border-emerald-500/20 bg-emerald-500/10 opacity-0":selectedTerm===card.id?"border-amber-500 bg-amber-500/10":dark?"border-slate-700 bg-slate-800":"border-slate-200 bg-slate-50")+" "+text}>{card.term}</button>)}</div><div className="space-y-2">{matchDefinitions.map(card=><button key={card.id} type="button" disabled={matched.includes(card.id)} onClick={()=>{setSelectedDefinition(card.id);if(selectedTerm)resolveMatch(selectedTerm,card.id);}} className={"min-h-16 w-full rounded-xl border p-3 text-left text-xs font-bold leading-5 sm:text-sm "+(matched.includes(card.id)?"border-emerald-500/20 bg-emerald-500/10 opacity-0":selectedDefinition===card.id?"border-amber-500 bg-amber-500/10":dark?"border-slate-700 bg-slate-800":"border-slate-200 bg-slate-50")+" "+text}>{card.definition}</button>)}</div></div><div className={"mt-5 flex items-center justify-between text-xs font-bold "+muted}><span>正解ペア {matched.length} / {runCards.length}</span><span>すべて消すと完了</span></div></section>
  </div>;

  const renderResult = () => result && <div className="mx-auto max-w-2xl space-y-5"><section className={"overflow-hidden rounded-[28px] border text-center "+panel}><div className="bg-gradient-to-br from-blue-700 to-cyan-500 px-5 py-8 text-white"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/30 bg-white/15"><Trophy size={30}/></div><p className="mt-4 text-[10px] font-black tracking-[0.2em] text-cyan-100">SESSION COMPLETE</p><h1 className="mt-2 text-2xl font-black">学習完了！</h1><p className="mt-2 text-sm text-white/85">{selectedSet?.title}</p><p className="mt-5 text-5xl font-black tabular-nums">{result.score}<span className="text-2xl">%</span></p><p className="mt-1 text-xs text-white/80">正答率</p></div><div className="grid grid-cols-3 gap-2 p-4">{[{label:"正解",value:result.correct,color:"text-emerald-500"},{label:"不正解",value:result.incorrect,color:"text-rose-500"},{label:"時間",value:durationText(result.seconds),color:text}].map(item=><div key={item.label} className={"rounded-xl p-3 "+soft}><p className={"text-[10px] font-bold "+muted}>{item.label}</p><p className={"mt-1 text-xl font-black tabular-nums "+item.color}>{item.value}</p></div>)}</div></section>
    {result.mode==="test"&&testResults.length>0&&<section className={"overflow-hidden rounded-2xl border "+panel}><div className="border-b border-inherit p-4"><h2 className={"font-black "+text}>テストの振り返り</h2></div><div className="divide-y divide-slate-200/70 dark:divide-slate-700">{testResults.map((item,index)=><div key={item.question.card.id} className="flex items-start gap-3 p-3"><span className={"mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full "+(item.correct?"bg-emerald-500/10 text-emerald-500":"bg-rose-500/10 text-rose-500")}>{item.correct?<Check size={14}/>:<X size={14}/>}</span><div className="min-w-0 flex-1"><p className={"text-sm font-black "+text}>{index+1}. {sideText(item.question.card,item.question.promptSide)}</p><p className={"mt-1 text-xs "+muted}>あなたの回答：{item.answer||"未回答"}</p>{!item.correct&&<p className="mt-1 text-xs font-bold text-emerald-500">正解：{item.question.answer}</p>}</div></div>)}</div></section>}
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>{if(result.mode==="flashcards")startFlashcards();else if(result.mode==="learn")startLearn();else if(result.mode==="test")setScreen("test-config");else startMatch();}} className={primary}><RotateCcw size={15}/> もう一度</button><button type="button" onClick={()=>setScreen("detail")} className={secondary}>セットに戻る</button></div>
  </div>;

  return <div className={"mx-auto w-full max-w-6xl space-y-5 pb-8 "+text}>
    {screen!=="library"&&screen!=="editor"&&screen!=="flashcards"&&screen!=="learn"&&screen!=="test"&&screen!=="match"&&screen!=="result"&&<header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white"><Layers3 size={19}/></div><div><p className="text-[10px] font-black tracking-[0.18em] text-cyan-500">CAMPUSSYNC</p><p className={"text-sm font-black "+text}>カード学習</p></div></div><div className="flex items-center gap-2">{!online&&<span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-500"><WifiOff size={12}/> オフライン</span>}{online&&syncing&&<span className="text-[10px] font-bold text-cyan-500">同期中…</span>}<button type="button" onClick={()=>setScreen("library")} className={secondary}><Layers3 size={14}/> セット一覧</button></div></header>}
    {message&&<div role="status" aria-live="polite" className={"flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs font-bold "+(dark?"border-cyan-900 bg-cyan-950/40 text-cyan-200":"border-cyan-200 bg-cyan-50 text-cyan-900")}><span>{message}</span><button type="button" onClick={()=>setMessage("")} aria-label="通知を閉じる"><X size={14}/></button></div>}
    {error&&screen==="library"&&<div className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">{error}</div>}
    {screen==="library"&&(loading?<div className={"rounded-2xl border p-10 text-center "+panel}><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"/><p className={"mt-3 text-sm font-bold "+muted}>読み込み中…</p></div>:renderLibrary())}
    {screen==="detail"&&renderDetail()}
    {screen==="editor"&&renderEditor()}
    {screen==="flashcards"&&renderFlashcards()}
    {screen==="learn"&&renderLearn()}
    {screen==="test-config"&&renderTestConfig()}
    {screen==="test"&&renderTest()}
    {screen==="match"&&renderMatch()}
    {screen==="result"&&renderResult()}
    <footer className={"flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-[10px] "+(dark?"border-slate-800 text-slate-500":"border-slate-200 text-slate-400")}><span>自分の学習を、自分のペースで。</span><span>{online?"オンライン同期対応":"端末保存モード"} ・ 学習結果はアカウントごとに保存</span></footer>
  </div>;
}
