'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import SiteHeader from '@/components/SiteHeader';

const PREFERRED_ROLE_KEY = 'morongwa_preferred_role';

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'runner' | 'both'>('client');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{email?: string; password?: string}>({});
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const r = searchParams.get('role');
    if (r === 'client' || r === 'runner' || r === 'both') setRole(r);
  }, [searchParams]);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {email?: string; password?: string} = {};

    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Please enter a valid email';

    if (!password) newErrors.password = 'Password is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix the errors');
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(PREFERRED_ROLE_KEY, role);
      }
      toast.success('Welcome back!');
      const returnTo = searchParams.get('returnTo');
      const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/wall';
      router.push(target);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Login failed';
      toast.error(errorMsg);
      if (errorMsg.toLowerCase().includes('email') || errorMsg.toLowerCase().includes('user')) {
        setErrors({ email: 'No account found with this email' });
      } else if (errorMsg.toLowerCase().includes('password')) {
        setErrors({ password: 'Incorrect password' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <SiteHeader />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-10 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-sky-200/60 to-blue-300/40 blur-3xl" />
        <div className="absolute right-[-6rem] top-6 h-80 w-80 rounded-full bg-gradient-to-tr from-cyan-200/60 via-blue-200/45 to-indigo-200/50 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.14),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.12),transparent_40%),radial-gradient(circle_at_50%_80%,rgba(99,102,241,0.10),transparent_45%)]" />
      </div>

      <div className="relative z-10 grid max-w-5xl w-full grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
        <div className="hidden lg:flex flex-col gap-6 bg-white/80 border border-sky-100 rounded-3xl p-10 shadow-2xl backdrop-blur-lg">
          <div className="inline-flex items-center gap-3 text-sky-700 uppercase tracking-[0.3em] text-xs font-semibold">
            <span className="h-px w-10 bg-sky-500/50" />
            <span className="text-3xl font-bold leading-none">Morongwa</span>
          </div>
          <div className="space-y-3">
            <p className="text-4xl font-semibold leading-tight text-slate-900">
              Your errand guys
            </p>
            <p className="text-base text-slate-600 max-w-xl">
              Seamless tasks, real-time updates, secure payouts. We keep your errands moving so you can focus on living.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-sky-800">
            <span className="px-3 py-1 rounded-full bg-sky-100 border border-sky-200">#iceboy</span>
            <span className="px-3 py-1 rounded-full bg-sky-100 border border-sky-200">#spaceman</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live and secure · 24/7 uptime
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10 text-slate-900">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-slate-900 text-center">Welcome back</h2>
            <p className="text-center text-sm text-slate-600">Sign in to your Morongwa account</p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-slate-700 mb-1">
                  I'm signing in as
                </label>
                <select
                  id="role"
                  name="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'client' | 'runner' | 'both')}
                  className="block w-full px-3 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="client">Client</option>
                  <option value="runner">Runner</option>
                  <option value="both">Both</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">You can switch between roles from your profile later.</p>
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errors.email) setErrors({ ...errors, email: undefined });
                    }}
                    onBlur={(e) => {
                      if (e.target.value && !validateEmail(e.target.value)) {
                        setErrors({ ...errors, email: 'Please enter a valid email' });
                      }
                    }}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 transition ${
                      errors.email ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="you@example.com"
                    aria-invalid={!!errors.email}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors({ ...errors, password: undefined });
                    }}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 transition ${
                      errors.password ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="••••••••"
                    aria-invalid={!!errors.password}
                  />
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center items-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:from-blue-400 disabled:to-indigo-400 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-5 w-5" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>

            <div className="text-sm text-center space-y-2">
              <div>
                <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                  Forgot your password?
                </Link>
              </div>
              <div className="text-slate-600">
                Don't have an account?{' '}
                <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
                  Register now
                </Link>
              </div>
            </div>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white">
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
