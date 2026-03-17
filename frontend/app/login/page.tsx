'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** All sign-in is on the landing page. Redirect and preserve returnTo. */
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const returnTo = searchParams.get('returnTo');
    const url = returnTo ? `/?signin=1&returnTo=${encodeURIComponent(returnTo)}` : '/?signin=1';
    router.replace(url);
  }, [router, searchParams]);

  return null;
}
