'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getBrowserCampusLanguage,
  translateCampusText,
  type CampusLanguage,
} from '@/lib/campus-i18n';

type CampusLanguageContextValue = {
  language: CampusLanguage;
  setLanguage: (language: CampusLanguage) => void;
  translate: (value: string) => string;
};

const CampusLanguageContext = createContext<CampusLanguageContextValue | null>(null);
const STORAGE_KEY = 'campussync-language';
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'aria-label', 'title'] as const;
const IGNORED_SELECTOR = [
  'input', 'textarea', 'script', 'style', 'code', 'pre', 'svg', 'canvas',
  '[contenteditable="true"]', '[data-i18n-ignore="true"]', '[data-user-content]',
  '.campus-note-editor', '.campus-chat-shell', '.campus-chat-panel',
  '.campus-chat-messages', '.campus-ai-chat-history',
].join(',');

type TextRecord = { original: string; translated: string };
type AttributeRecord = { original: string; translated: string };

function hasIgnoredAncestor(element: Element | null): boolean {
  return Boolean(element?.closest(IGNORED_SELECTOR));
}

function preserveWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  return leading + translated + trailing;
}

export function CampusLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<CampusLanguage>('ja');

  const setLanguage = useCallback((next: CampusLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Language selection still works when browser storage is unavailable.
    }
  }, []);

  const translate = useCallback((value: string) => translateCampusText(value, language), [language]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      const supported = saved === 'ja' || saved === 'en' || saved === 'ar' || saved === 'ko' || saved === 'zh';
      setLanguageState(supported ? saved : getBrowserCampusLanguage(window.navigator.language));
    } catch {
      setLanguageState(getBrowserCampusLanguage(window.navigator.language));
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const selected = language === 'zh' ? 'zh-CN' : language;
    root.lang = selected;
    root.dir = language === 'ar' ? 'rtl' : 'ltr';
    root.dataset.campusLanguage = language;

    const textRecords = new WeakMap<Text, TextRecord>();
    const trackedTextNodes = new Set<Text>();
    const attributeRecords = new WeakMap<Element, Map<string, AttributeRecord>>();
    const trackedElements = new Set<Element>();

    const applyText = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || hasIgnoredAncestor(parent)) return;
      const current = node.data;
      if (!current.trim()) return;
      let record = textRecords.get(node);
      if (!record || current !== record.translated) {
        record = { original: current, translated: current };
        textRecords.set(node, record);
      }
      const normalized = record.original.trim().replace(/\s+/g, ' ');
      const translated = translateCampusText(normalized, language);
      const next = translated === normalized ? record.original : preserveWhitespace(record.original, translated);
      record.translated = next;
      trackedTextNodes.add(node);
      if (node.data !== next) node.data = next;
    };

    const applyAttributes = (element: Element) => {
      if (hasIgnoredAncestor(element)) return;
      let records = attributeRecords.get(element);
      if (!records) {
        records = new Map<string, AttributeRecord>();
        attributeRecords.set(element, records);
      }
      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        if (!element.hasAttribute(attribute)) continue;
        const current = element.getAttribute(attribute) || '';
        if (!current.trim()) continue;
        let record = records.get(attribute);
        if (!record || current !== record.translated) {
          record = { original: current, translated: current };
          records.set(attribute, record);
        }
        const normalized = record.original.trim().replace(/\s+/g, ' ');
        const translated = translateCampusText(normalized, language);
        const next = translated === normalized ? record.original : preserveWhitespace(record.original, translated);
        record.translated = next;
        trackedElements.add(element);
        if (current !== next) element.setAttribute(attribute, next);
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
      if (element) {
        const descendants = element.querySelectorAll('*');
        descendants.forEach(applyAttributes);
      }
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
