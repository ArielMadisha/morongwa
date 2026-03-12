'use client';

import { useState } from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from '@/contexts/TranslationContext';

export function LanguageSelector() {
  const { targetLanguage, setTargetLanguage, languages } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        title="Translation language"
      >
        <Languages className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">
          {languages.find((l) => l.code === targetLanguage)?.name ?? targetLanguage}
        </span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full mt-1 py-2 bg-white rounded-xl border border-slate-200 shadow-xl z-50 min-w-[180px] max-h-[280px] overflow-y-auto">
            <p className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Translate to
            </p>
            {languages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  setTargetLanguage(lang.code);
                  setOpen(false);
                }}
                className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-50 ${
                  targetLanguage === lang.code ? 'bg-sky-50 text-sky-700 font-medium' : 'text-slate-700'
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
