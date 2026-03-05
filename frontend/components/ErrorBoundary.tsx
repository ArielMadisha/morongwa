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
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
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
              An unexpected error occurred. Please try reloading the page.
            </p>

            {this.state.error && process.env.NODE_ENV === 'development' && (
              <pre className="mt-4 p-3 bg-slate-100 text-slate-700 rounded-lg text-sm overflow-auto border border-slate-200">
                {this.state.error.message}
              </pre>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-5 py-3 rounded-lg bg-brand-500 text-white font-semibold shadow-sm hover:bg-brand-600 hover:shadow-md transition"
              >
                <RefreshCcw className="h-4 w-4" />
                Reload Page
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
