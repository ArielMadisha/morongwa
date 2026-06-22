'use client';

import { useState } from 'react';
import { Languages, Loader2 } from 'lucide-react';
import { translateAPI } from '@/lib/api';
import { useTranslation } from '@/contexts/TranslationContext';
import toast from 'react-hot-toast';
import { LinkifiedText } from '@/components/LinkifiedText';

interface TranslateTextProps {
  text: string;
  className?: string;
  /** Optional: render as different element */
  as?: 'p' | 'span' | 'div';
  /** Compact variant for comments */
  compact?: boolean;
  /** Preserve line breaks and spaces (long-form captions, stories) */
  preserveWhitespace?: boolean;
}

export function TranslateText({
  text,
  className = '',
  as: Component = 'span',
  compact,
  preserveWhitespace,
}: TranslateTextProps) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const { targetLanguage } = useTranslation();

  const displayText = showOriginal ? text : (translated ?? text);
  const hasTranslated = translated !== null;

  const handleTranslate = async () => {
    if (!text?.trim()) return;
    if (hasTranslated) {
      setShowOriginal((v) => !v);
      return;
    }
    setLoading(true);
    try {
      const res = await translateAPI.translate(text, targetLanguage);
      const result = res.data?.translatedText ?? (res as any)?.translatedText;
      if (result) {
        setTranslated(result);
        setShowOriginal(false);
      } else {
        toast.error('Translation failed');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Translation failed');
    } finally {
      setLoading(false);
    }
  };

  if (!text?.trim()) return null;

  const rootClass = preserveWhitespace
    ? `inline-flex w-full min-w-0 items-start gap-2 ${className}`.trim()
    : `${Component === 'span' ? 'inline ' : ''}${className}`.trim();

  const textSpanClass = preserveWhitespace ? 'whitespace-pre-wrap break-words flex-1 min-w-0' : '';

  const translateBtnClass = preserveWhitespace
    ? `shrink-0 self-start mt-0.5 inline-flex items-center text-sky-600 hover:text-sky-700 ${compact ? 'text-sky-500' : ''}`
    : `ml-1.5 align-middle inline-flex items-center text-sky-600 hover:text-sky-700 ${compact ? 'text-sky-500' : ''}`;

  return (
    <Component className={rootClass}>
      <span className={textSpanClass}>
        <LinkifiedText text={displayText} preserveWhitespace={preserveWhitespace} />
      </span>
      <button
        type="button"
        onClick={handleTranslate}
        disabled={loading}
        className={translateBtnClass}
        title={hasTranslated ? (showOriginal ? 'Show translation' : 'Show original') : 'Translate'}
      >
        {loading ? (
          <Loader2 className={compact ? 'h-3 w-3 animate-spin' : 'h-3.5 w-3.5 animate-spin'} />
        ) : (
          <Languages className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        )}
      </button>
    </Component>
  );
}
