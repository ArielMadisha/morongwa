'use client';

import { useMemo, type ReactNode } from 'react';

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function splitTrailingPunct(url: string): { href: string; display: string; extra: string } {
  let core = url;
  let extra = '';
  while (core.length > 0 && /[.,;:!?)]+$/.test(core)) {
    const m = core.match(/[.,;:!?)]+$/);
    if (!m) break;
    extra = m[0] + extra;
    core = core.slice(0, -m[0].length);
  }
  let href = core;
  if (href.startsWith('www.')) href = `https://${href}`;
  return { href, display: core || url, extra };
}

type LinkifyOptions = {
  linkClassName?: string;
  keyPrefix?: string;
};

/** Turn plain-text URLs into clickable external links. */
export function linkifyText(text: string, opts?: LinkifyOptions): ReactNode[] {
  if (!text) return [];
  const linkClass =
    opts?.linkClassName ?? 'underline text-sky-600 hover:text-sky-700 break-all';
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const raw = m[0];
    const { href, display, extra } = splitTrailingPunct(raw);
    nodes.push(
      <a
        key={`${opts?.keyPrefix ?? 'u'}-${idx}-${n++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        onClick={(e) => e.stopPropagation()}
      >
        {display}
      </a>
    );
    if (extra) nodes.push(extra);
    last = idx + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

type Props = {
  text: string;
  className?: string;
  linkClassName?: string;
  as?: 'span' | 'p' | 'div';
  preserveWhitespace?: boolean;
};

export function LinkifiedText({
  text,
  className = '',
  linkClassName,
  as: Tag = 'span',
  preserveWhitespace,
}: Props) {
  const nodes = useMemo(
    () => linkifyText(text, { linkClassName, keyPrefix: 'lt' }),
    [text, linkClassName]
  );
  if (!text?.trim()) return null;
  const whitespace = preserveWhitespace ? 'whitespace-pre-wrap break-words' : '';
  return <Tag className={`${whitespace} ${className}`.trim()}>{nodes}</Tag>;
}
