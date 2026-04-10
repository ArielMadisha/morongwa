'use client';

import Link from 'next/link';

export default function MochinaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-sky-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-3xl font-bold text-slate-900">Welcom to Mochina</h1>
          <p className="mt-3 text-slate-600">
            Start playing Mochina from here.
          </p>

          <div className="mt-6 space-y-3">
            <a
              href="/zweppeJoinByUrl"
              className="inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-5 py-3 text-base font-semibold text-white hover:bg-sky-700"
            >
              Open Mochina Game
            </a>
            <Link
              href="/qwerty-world"
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open QwertyWorld
            </Link>
          </div>

          <p className="mt-5 text-xs text-slate-500">
            If the legacy game path is unavailable, restore the backed-up Mochina files on production and this launcher will start working automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
