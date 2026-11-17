'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBrowserCampusLanguage,
  lookupCampusTranslation,
  type CampusLanguage,
} from '@/lib/campus-i18n';

type CampusLanguageContextValue = {
  language: CampusLanguage;
  setLanguage: (language: CampusLanguage) => void;
  translate: (value: string) => string;
};

type TextRecord = { source: string; output: string };
type AttributeRecord = { source: string; output: string };
type PendingItem = {
  source: string;
  callbacks: Array<(translation: string) => void>;
};

const CampusLanguageContext = createContext<CampusLanguageContextValue | null>(null);
const STORAGE_KEY = 'campussync-language';
const CACHE_PREFIX = 'campussync-ui-translation-v3:';
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'] as const;
const IGNORED_SELECTOR = [
  'input', 'textarea', 'script', 'style', 'code', 'pre', 'svg', 'canvas',
  '[contenteditable="true"]',
  '[data-i18n-ignore="true"]',
  '[data-user-content]',
  '[data-no-translate="true"]',
  '.campus-note-editor',
  '.campus-chat-shell',
  '.campus-chat-panel',
  '.campus-chat-messages',
  '.campus-ai-chat-history',
].join(',');

const JAPANESE_TEXT = /[ぁ-んァ-ヶ一-龠]/u;
const BATCH_SIZE = 8;
const PARALLEL_BATCHES = 3;

function hasIgnoredAncestor(element: Element | null): boolean {
  return Boolean(element?.closest(IGNORED_SELECTOR));
}

function preserveWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/u)?.[0] ?? '';
  const trailing = original.match(/\s*$/u)?.[0] ?? '';
  return leading + translated + trailing;
}

function normalizedKey(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function isWorthTranslating(value: string): boolean {
  const normalized = normalizedKey(value);
  return normalized.length > 0
    && normalized.length <= 600
    && JAPANESE_TEXT.test(normalized)
    && !/^https?:\/\//iu.test(normalized);
}

export function CampusLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<CampusLanguage>('ja');
  const languageRef = useRef<CampusLanguage>('ja');
  languageRef.current = language;

  const textRecordsRef = useRef<WeakMap<Text, TextRecord>>(new WeakMap());
  const attributeRecordsRef = useRef<WeakMap<Element, Map<string, AttributeRecord>>>(new WeakMap());
  const cacheRef = useRef<Record<string, Record<string, string>>>({});
  const pendingRef = useRef<Map<string, PendingItem>>(new Map());
  const generationRef = useRef(0);
  const flushTimerRef = useRef<number | null>(null);

  const setLanguage = useCallback((next: CampusLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The selection remains active for this page even if storage is unavailable.
    }
  }, []);

  const translate = useCallback((value: string) => lookupCampusTranslation(value, language) ?? value, [language]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'ja' || saved === 'en' || saved === 'ar' || saved === 'ko' || saved === 'zh') {
        setLanguageState(saved);
      } else {
        setLanguageState(getBrowserCampusLanguage(window.navigator.language));
      }
    } catch {
      setLanguageState(getBrowserCampusLanguage(window.navigator.language));
    }
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    pendingRef.current.clear();
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const root = document.documentElement;
    root.lang = language === 'zh' ? 'zh-CN' : language;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
    root.dataset.campusLanguage = language;

    if (language === 'zh' || language === 'ar' || language === 'ko' || language === 'en') {
      const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (description) {
        const translated = lookupCampusTranslation(description.content, language);
        if (translated) description.content = translated;
      }
    }

    if (!cacheRef.current[language]) {
      try {
        const saved = window.localStorage.getItem(CACHE_PREFIX + language);
        cacheRef.current[language] = saved ? JSON.parse(saved) as Record<string, string> : {};
      } catch {
        cacheRef.current[language] = {};
      }
    }

    const languageCache = cacheRef.current[language];

    const saveCache = () => {
      try {
        const entries = Object.entries(languageCache);
        const bounded = entries.length > 6000 ? Object.fromEntries(entries.slice(-6000)) : languageCache;
        window.localStorage.setItem(CACHE_PREFIX + language, JSON.stringify(bounded));
      } catch {
        // Translation remains usable in memory when local storage is full or disabled.
      }
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = window.setTimeout(() => {
        flushTimerRef.current = null;
        void Promise.all(Array.from({ length: PARALLEL_BATCHES }, async () => {
          while (generation === generationRef.current && pendingRef.current.size > 0) {
            const batch = Array.from(pendingRef.current.entries()).slice(0, BATCH_SIZE);
            batch.forEach(([key]) => pendingRef.current.delete(key));
            if (!batch.length) return;

            try {
              const response = await fetch('/api/i18n/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language, items: batch.map(([, item]) => item.source) }),
              });
              if (!response.ok) throw new Error('Translation service returned ' + response.status);
              const result = await response.json() as { translations?: unknown };
              const values = Array.isArray(result.translations) ? result.translations : [];

              batch.forEach(([, item], index) => {
                const translated = typeof values[index] === 'string' ? values[index].trim() : '';
                if (generation !== generationRef.current || languageRef.current !== language) return;
                if (!translated) return;
                languageCache[item.source] = translated;
                item.callbacks.forEach(callback => callback(translated));
              });
              saveCache();
            } catch (error) {
              console.warn('CampusSync translation batch was not completed:', error instanceof Error ? error.message : 'unknown error');
              batch.forEach(([, item]) => {
                if (generation !== generationRef.current || languageRef.current !== language) return;
                item.callbacks.forEach(callback => callback(item.source));
              });
            }
          }
        })).finally(() => {
          if (generation === generationRef.current && pendingRef.current.size > 0) scheduleFlush();
        });
      }, 60);
    };

    const resolveTranslation = (source: string, apply: (value: string) => void) => {
      if (language === 'ja') {
        apply(source);
        return;
      }

      const normalized = normalizedKey(source);
      const manual = lookupCampusTranslation(normalized, language);
      if (manual) {
        apply(preserveWhitespace(source, manual));
        return;
      }

      const cached = languageCache[normalized];
      if (cached) {
        apply(preserveWhitespace(source, cached));
        return;
      }

      if (!isWorthTranslating(normalized)) {
        apply(source);
        return;
      }

      const key = language + '\u0000' + normalized;
      const existing = pendingRef.current.get(key);
      if (existing) {
        existing.callbacks.push(value => apply(preserveWhitespace(source, value)));
        return;
      }

      pendingRef.current.set(key, {
        source: normalized,
        callbacks: [value => apply(preserveWhitespace(source, value))],
      });
      scheduleFlush();
    };

    const applyText = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || hasIgnoredAncestor(parent)) return;
      const current = node.data;
      if (!current.trim()) return;

      let record = textRecordsRef.current.get(node);
      if (!record) {
        record = { source: current, output: current };
        textRecordsRef.current.set(node, record);
      } else if (current !== record.output) {
        record.source = current;
        record.output = current;
      }

      const activeRecord = record;
      resolveTranslation(activeRecord.source, translated => {
        if (generation !== generationRef.current || languageRef.current !== language) return;
        if (textRecordsRef.current.get(node) !== activeRecord || !node.isConnected) return;
        if (node.data !== activeRecord.output) return;
        if (node.data !== translated) {
          activeRecord.output = translated;
          node.data = translated;
        }
      });
    };

    const applyAttributes = (element: Element) => {
      if (hasIgnoredAncestor(element)) return;
      let records = attributeRecordsRef.current.get(element);
      if (!records) {
        records = new Map<string, AttributeRecord>();
        attributeRecordsRef.current.set(element, records);
      }

      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute) || '';
        if (!current.trim()) continue;

        let record = records.get(attribute);
        if (!record) {
          record = { source: current, output: current };
          records.set(attribute, record);
        } else if (current !== record.output) {
          record.source = current;
          record.output = current;
        }

        const activeRecord = record;
        resolveTranslation(activeRecord.source, translated => {
          if (generation !== generationRef.current || languageRef.current !== language) return;
          if (!element.isConnected || records?.get(attribute) !== activeRecord) return;
          if (element.getAttribute(attribute) !== activeRecord.output) return;
          if (element.getAttribute(attribute) !== translated) {
            activeRecord.output = translated;
            element.setAttribute(attribute, translated);
          }
        });
      }
    };

    const scan = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        applyText(node as Text);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : null;
      if (element && hasIgnoredAncestor(element)) return;
      if (element) applyAttributes(element);

      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) applyText(textNode);

      if (element) element.querySelectorAll('*').forEach(applyAttributes);
    };

    scan(document.body);

    const observer = new MutationObserver(records => {
      for (const mutation of records) {
        if (mutation.type === 'characterData') {
          applyText(mutation.target as Text);
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(scan);
        } else if (mutation.type === 'attributes') {
          applyAttributes(mutation.target as Element);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      pendingRef.current.clear();
    };
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, translate }), [language, setLanguage, translate]);
  return <CampusLanguageContext.Provider value={value}>{children}</CampusLanguageContext.Provider>;
}

export function useCampusLanguage(): CampusLanguageContextValue {
  const context = useContext(CampusLanguageContext);
  if (!context) throw new Error('useCampusLanguage must be used inside CampusLanguageProvider.');
  return context;
}
