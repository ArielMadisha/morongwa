'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import SiteHeader from '@/components/SiteHeader';
import AuthBackground from '@/components/AuthBackground';

function LoginForm() {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{email?: string; password?: string}>({});
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (!u.searchParams.has('password') && !u.searchParams.has('email')) return;
    u.searchParams.delete('password');
    u.searchParams.delete('email');
    const next = u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : '') + u.hash;
    window.history.replaceState({}, '', next);
  }, []);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const looksLikePhone = (v: string) => v.replace(/\D/g, '').length >= 10 && !v.includes('@');
  const looksLikeUsername = (v: string) => /^[a-zA-Z0-9_]{2,30}$/.test(v.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {email?: string; password?: string} = {};

    if (!emailOrPhone.trim()) newErrors.email = 'Email, username or phone is required';
    else if (!looksLikePhone(emailOrPhone) && !validateEmail(emailOrPhone) && !looksLikeUsername(emailOrPhone)) newErrors.email = 'Please enter a valid email, username or phone';

    if (!password) newErrors.password = 'Password is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix the errors');
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const usePhone = looksLikePhone(emailOrPhone);
      const useUsername = !usePhone && looksLikeUsername(emailOrPhone);
      await login(emailOrPhone.trim(), password, usePhone, useUsername);
      toast.success('Welcome back!');
      // Read returnTo from the URL on the client only — avoids useSearchParams() + Suspense
      // hanging forever on some production builds.
      let returnTo: string | null = null;
      if (typeof window !== 'undefined') {
        returnTo = new URLSearchParams(window.location.search).get('returnTo');
      }
      const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/wall';
      // Allow React state and localStorage to settle before navigation
      await new Promise((r) => setTimeout(r, 50));
      router.push(target);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || 'Login failed';
      const isInvalidCreds = errorMsg.toLowerCase().includes('invalid credentials') || error.response?.status === 401;
      const isRateLimited = error.response?.status === 429;
      const displayMsg = isInvalidCreds
        ? 'Incorrect email/username/phone or password. Please try again.'
        : isRateLimited
        ? 'Too many requests right now. Please wait a moment, then try signing in again.'
        : error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')
        ? 'Unable to connect. Please check your connection and that the server is running.'
        : errorMsg;
      toast.error(displayMsg);
      if (isInvalidCreds) {
        setErrors({ password: 'Incorrect email/username/phone or password' });
      } else if (isRateLimited) {
        setErrors({ password: 'Too many attempts. Please wait and retry.' });
      } else if (errorMsg.toLowerCase().includes('email') || errorMsg.toLowerCase().includes('user')) {
        setErrors({ email: 'No account found with this email' });
      } else if (errorMsg.toLowerCase().includes('password')) {
        setErrors({ password: 'Incorrect password' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden text-slate-900">
      <AuthBackground />
      <div className="relative z-10">
        <SiteHeader minimal />
      </div>
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10 text-slate-900">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-slate-900 text-center">Welcome back</h2>
            <p className="text-center text-sm text-slate-600">Sign in to your Qwertymates account</p>
          </div>

          <form className="mt-8 space-y-6" method="post" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                  Username/Email/Phone
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    required
                    value={emailOrPhone}
                    onChange={(e) => {
                      setEmailOrPhone(e.target.value);
                      if (errors.email) setErrors({ ...errors, email: undefined });
                    }}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v && !looksLikePhone(v) && !validateEmail(v) && !looksLikeUsername(v)) {
                        setErrors({ ...errors, email: 'Please enter a valid email, username or phone' });
                      }
                    }}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 transition ${
                      errors.email ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="Username/Email/Phone"
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
                className="group relative w-full flex justify-center items-center gap-2 min-h-[48px] py-3 px-4 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:from-blue-400 disabled:to-indigo-400 disabled:cursor-not-allowed transition-all active:from-blue-800 active:to-indigo-800"
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

            <div className="text-sm text-center space-y-3">
              <div>
                <Link href="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500 inline-block py-3 px-4 -m-2 rounded-lg hover:bg-blue-50 active:bg-blue-100">
                  Forgot your password?
                </Link>
              </div>
              <div className="text-slate-600">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500 inline-block py-3 px-4 -m-2 rounded-lg hover:bg-blue-50 active:bg-blue-100">
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
  return <LoginForm />;
}
