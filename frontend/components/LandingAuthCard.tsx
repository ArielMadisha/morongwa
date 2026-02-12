'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import LandingSignupCard from '@/components/LandingSignupCard';
import LandingLoginCard from '@/components/LandingLoginCard';

function LandingAuthCardInner() {
  const searchParams = useSearchParams();
  const signin = searchParams.get('signin') === '1';

  return signin ? <LandingLoginCard /> : <LandingSignupCard />;
}

export default function LandingAuthCard() {
  return (
    <Suspense fallback={
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 min-h-[380px] flex items-center justify-center shadow-sm">
        <div className="animate-pulse text-sm text-slate-400">Loading...</div>
      </div>
    }>
      <LandingAuthCardInner />
    </Suspense>
  );
}
