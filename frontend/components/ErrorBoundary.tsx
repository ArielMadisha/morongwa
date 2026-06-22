'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  supportId?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    let supportId = String(Date.now()).slice(-8);
    try {
      if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        supportId = crypto.randomUUID().slice(0, 8);
      }
    } catch {
      /* ignore */
    }
    return { hasError: true, error: err, supportId };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error?.message, error, errorInfo.componentStack);
  }

  private async hardReload() {
    if (typeof window === 'undefined') return;
    const href = window.location.href;
    try {
      // Recover from stale JS bundles/chunk errors in mobile webviews after deploys.
      try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } catch {
        /* private mode / embedded webview may block storage */
      }
      try {
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      }
    } catch (e) {
      console.warn('Hard reload cleanup failed:', e);
    }
    // Some Android in-app browsers ignore replace(); assign is usually more reliable.
    try {
      const next = new URL(href);
      next.searchParams.set('_r', Date.now().toString());
      window.location.assign(next.toString());
    } catch {
      try {
        window.location.reload();
      } catch {
        window.location.href = href.split('#')[0] + (href.includes('?') ? '&' : '?') + '_r=' + Date.now();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-lg rounded-2xl p-8 shadow-lg bg-white/80 backdrop-blur-xl border border-slate-200">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="h-7 w-7 shrink-0" />
              <h2 className="text-2xl font-bold">Oops! Something went wrong</h2>
            </div>

            <p className="text-slate-600 mt-3">
              An unexpected error occurred while loading Qwertymates. Please try{' '}
              <strong>Reload App</strong> (wait a second — some in-app browsers need a moment). If it keeps
              happening, use <strong>Go Home</strong> or clear site data for qwertymates.com in Chrome/Samsung
              Internet settings.
            </p>

            {this.state.supportId ? (
              <p className="text-xs text-slate-500 mt-2">
                Reference: <span className="font-mono">{this.state.supportId}</span>
              </p>
            ) : null}

            {this.state.error?.message ? (
              <pre className="mt-4 p-3 bg-slate-100 text-slate-800 rounded-lg text-sm overflow-auto border border-slate-200 whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
            ) : null}

            {this.state.error && process.env.NODE_ENV === 'development' && (
              <pre className="mt-2 p-3 bg-amber-50 text-slate-800 rounded-lg text-xs overflow-auto border border-amber-200">
                {this.state.error.stack}
              </pre>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => void this.hardReload()}
                className="flex items-center gap-2 px-5 py-3 rounded-lg bg-brand-500 text-white font-semibold shadow-sm hover:bg-brand-600 hover:shadow-md transition"
              >
                <RefreshCcw className="h-4 w-4" />
                Reload App
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-brand-200 text-brand-700 font-semibold hover:bg-brand-50 transition"
              >
                <Home className="h-4 w-4" />
                Go Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
