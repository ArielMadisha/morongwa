'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'preferred-translation-language';

const COMMON_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'af', name: 'Afrikaans' },
  { code: 'zu', name: 'Zulu' },
  { code: 'xh', name: 'Xhosa' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
];

interface TranslationContextType {
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  languages: { code: string; name: string }[];
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [targetLanguage, setTargetLanguageState] = useState('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTargetLanguageState(stored);
    }
  }, []);

  const setTargetLanguage = useCallback((lang: string) => {
    setTargetLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
    }
  }, []);

  return (
    <TranslationContext.Provider
      value={{
        targetLanguage,
        setTargetLanguage,
        languages: COMMON_LANGUAGES,
      }}
    >
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  return ctx ?? { targetLanguage: 'en', setTargetLanguage: () => {}, languages: COMMON_LANGUAGES };
}
