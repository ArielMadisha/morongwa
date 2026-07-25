'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { followsAPI, getImageUrl, getImageUrlFull, productsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toAppealingDisplayName, userPublicDisplayName } from '@/lib/userDisplayLabel';

type BirthdayUser = { _id: string; name?: string; avatar?: string; username?: string };

type SponsoredCard = {
  key: string;
  imageUrl: string;
  /** Product title shown as the main headline */
  title: string;
  /** Optional short product description under the title */
  description?: string;
  subtitle: string;
  href: string;
};

const SOLD_ON_LABEL = 'sold on QwertyHub';

function GiftIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect x="8" y="16" width="24" height="18" rx="2.5" fill="#5BB8FF" />
      <rect x="8" y="16" width="24" height="5" fill="#3AA0F0" />
      <rect x="18.5" y="16" width="3" height="18" fill="#FF4D7A" />
      <rect x="8" y="22.5" width="24" height="3" fill="#FF4D7A" />
      <path
        d="M20 16c-3.2-5.2-8.2-5.6-9.6-2.8-1.2 2.4 1.4 4.8 4.8 5.2 2.2.3 3.6-.4 4.8-2.4z"
        fill="#FF4D7A"
      />
      <path
        d="M20 16c3.2-5.2 8.2-5.6 9.6-2.8 1.2 2.4-1.4 4.8-4.8 5.2-2.2.3-3.6-.4-4.8-2.4z"
        fill="#FF4D7A"
      />
    </svg>
  );
}

function shuffleInPlace<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

type ProductRow = {
  _id: string;
  title?: string;
  description?: string;
  images?: string[];
  storeName?: string;
  storeSlug?: string;
  supplierId?: { storeName?: string; _id?: string; userId?: string } | string;
};

function firstUsableProductImage(images?: string[]): string {
  if (!Array.isArray(images)) return '';
  for (const raw of images) {
    const u = String(raw || '').trim();
    if (!u) continue;
    if (/placehold\.co|via\.placeholder|1x1|spacer/i.test(u)) continue;
    // Prefer real catalog /uploads assets (encoded paths with spaces/parens still ok).
    if (u.includes('/uploads/') || u.startsWith('uploads/') || !/^https?:\/\//i.test(u)) {
      return u;
    }
    // Allow https product CDNs as last resort.
    if (/^https:\/\//i.test(u)) return u;
  }
  return '';
}

function productCardFromProduct(p: ProductRow): SponsoredCard | null {
  const imageUrl = firstUsableProductImage(p.images);
  if (!imageUrl) return null;

  const productTitle = String(p.title || '').trim();
  const productDescription = String(p.description || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!productTitle && !productDescription) return null;

  const title = (productTitle || productDescription).slice(0, 72);
  // Description under title — skip if it duplicates the title.
  let description = '';
  if (productDescription && productDescription.toLowerCase() !== productTitle.toLowerCase()) {
    description = productDescription.slice(0, 110);
  }

  return {
    key: `product-${p._id}`,
    imageUrl,
    title,
    description: description || undefined,
    subtitle: SOLD_ON_LABEL,
    // Always open the QwertyHub product page (not the storefront).
    href: `/marketplace/product/${p._id}`,
  };
}

/** Pick up to `count` unique random QwertyHub products. */
async function pickRandomProductCards(count: number): Promise<SponsoredCard[]> {
  const res = await productsAPI.list({ random: true, limit: Math.max(40, count * 12) });
  const rows = res.data?.data ?? res.data ?? [];
  const list = Array.isArray(rows) ? (rows as ProductRow[]) : [];
  shuffleInPlace(list);

  const seen = new Set<string>();
  const out: SponsoredCard[] = [];
  for (const p of list) {
    const card = productCardFromProduct(p);
    if (!card) continue;
    if (seen.has(card.key)) continue;
    seen.add(card.key);
    out.push(card);
    if (out.length >= count) break;
  }
  return out;
}

function SponsoredThumb({
  src,
  alt,
  className,
  fallbackLetter,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLetter: string;
}) {
  const primary = getImageUrl(src) || src;
  const full = getImageUrlFull(src);
  const [display, setDisplay] = useState(primary);
  const [triedFull, setTriedFull] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDisplay(primary);
    setTriedFull(false);
    setFailed(false);
  }, [primary, src]);

  if (failed || !display) {
    return (
      <div className={`flex items-center justify-center bg-slate-200 text-slate-600 font-semibold ${className || ''}`}>
        {(fallbackLetter || 'Q').charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={display}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        if (!triedFull && full && full !== display) {
          setTriedFull(true);
          setDisplay(full);
          return;
        }
        setFailed(true);
      }}
    />
  );
}

function SponsoredRow({ card }: { card: SponsoredCard }) {
  const inner = (
    <>
      {/* FB-style sponsored: large rounded square so product art is clearly visible */}
      <div className="h-[108px] w-[108px] shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/80 shadow-sm">
        <SponsoredThumb
          src={card.imageUrl}
          alt=""
          className="h-full w-full object-cover"
          fallbackLetter={card.title}
        />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch py-0.5 min-h-[108px]">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[14px] font-bold text-slate-900 leading-snug">{card.title}</p>
          {card.description ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-600">{card.description}</p>
          ) : null}
        </div>
        <p className="mt-3 truncate text-[12px] font-medium text-sky-600">{card.subtitle}</p>
      </div>
    </>
  );

  return (
    <Link
      href={card.href}
      className="flex cursor-pointer items-stretch gap-3 rounded-lg hover:bg-slate-50 transition-colors p-0.5 -m-0.5"
    >
      {inner}
    </Link>
  );
}

type Props = {
  /** Bump when wall refreshes so sponsored stores reshuffle. */
  refreshKey?: number;
};

/** Sponsored product rows + Birthdays (today) for wall right rail. */
export function WallRightRailExtras({ refreshKey = 0 }: Props) {
  const { user } = useAuth();
  const uid = user?._id || (user as { id?: string } | undefined)?.id;
  const [birthdays, setBirthdays] = useState<BirthdayUser[]>([]);
  const [sponsoredAdvert, setSponsoredAdvert] = useState<SponsoredCard | null>(null);
  const [sponsoredImage, setSponsoredImage] = useState<SponsoredCard | null>(null);

  useEffect(() => {
    if (!uid) {
      setBirthdays([]);
      return;
    }
    let cancelled = false;
    followsAPI
      .getBirthdaysToday({ limit: 12 })
      .then((res) => {
        if (cancelled) return;
        const users = res.data?.data?.users ?? [];
        setBirthdays(Array.isArray(users) ? users : []);
      })
      .catch(() => {
        if (!cancelled) setBirthdays([]);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cards = await pickRandomProductCards(2);
        if (cancelled) return;
        setSponsoredAdvert(cards[0] || null);
        setSponsoredImage(cards[1] || null);
      } catch {
        if (!cancelled) {
          setSponsoredAdvert(null);
          setSponsoredImage(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const birthdayLead = birthdays[0];
  const birthdayOthers = Math.max(0, birthdays.length - 1);
  const birthdayLabel = birthdayLead
    ? toAppealingDisplayName(
        userPublicDisplayName({
          name: birthdayLead.name,
          username: birthdayLead.username,
        })
      ) || 'Someone'
    : '';

  const hasSponsored = !!(sponsoredAdvert || sponsoredImage);
  const hasBirthdays = !!birthdayLead;

  if (!hasSponsored && !hasBirthdays) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {sponsoredAdvert ? (
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sponsored</p>
          <SponsoredRow card={sponsoredAdvert} />
        </div>
      ) : null}

      {sponsoredImage ? (
        <div className={sponsoredAdvert ? 'mt-3 border-t border-slate-100 pt-3' : ''}>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sponsored</p>
          <SponsoredRow card={sponsoredImage} />
        </div>
      ) : null}

      {hasBirthdays ? (
        <div className={hasSponsored ? 'mt-3 border-t border-slate-200 pt-3' : ''}>
          <p className="mb-2 text-[13px] font-semibold text-slate-600">Birthdays</p>
          <Link
            href={`/user/${birthdayLead!._id}`}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg hover:bg-slate-50 transition-colors p-0.5 -m-0.5"
          >
            <GiftIcon className="h-9 w-9 shrink-0" />
            <p className="min-w-0 text-[13px] leading-snug text-slate-800 pt-1">
              <span className="font-semibold text-slate-900">{birthdayLabel}</span>
              {birthdayOthers > 0 ? (
                <>
                  {' '}
                  and{' '}
                  <span className="font-semibold text-slate-900">
                    {birthdayOthers} other{birthdayOthers === 1 ? '' : 's'}
                  </span>
                </>
              ) : null}{' '}
              {birthdayOthers > 0 ? 'have birthdays today.' : 'has a birthday today.'}
            </p>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
