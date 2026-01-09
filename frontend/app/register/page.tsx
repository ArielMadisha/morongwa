'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, User, ArrowRight, Loader2, UserCircle, Package, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'runner' | 'both'>('both');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{name?: string; email?: string; password?: string; consent?: string}>({});
  const [acceptTos, setAcceptTos] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const getPasswordStrength = (password: string) => {
    const checks = {
      minLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
    };
    const score = Object.values(checks).filter(Boolean).length;
    if (score === 4) return { label: 'Strong', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (score === 3) return { label: 'Good', color: 'text-cyan-600', bg: 'bg-cyan-100' };
    if (score >= 2) return { label: 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: 'Weak', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: {name?: string; email?: string; password?: string; consent?: string} = {};

    if (!name.trim()) newErrors.name = 'Name is required';
    else if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';

    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Please enter a valid email';

    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (!acceptTos || !acceptPrivacy) {
      newErrors.email = newErrors.email; // keep existing typings intact
      newErrors.consent = 'Please accept the Terms and Privacy Policy';
    }

    if (Object.keys(newErrors).filter((k) => (newErrors as any)[k]).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix the errors');
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      // Convert selected role to array for API
      const roleToSend: string[] = role === 'both' ? ['client', 'runner'] : [role];
      await register(name.trim(), email.trim().toLowerCase(), password, roleToSend, ['terms-of-service', 'privacy-policy']);
      toast.success('🎉 Welcome to Morongwa!');
      router.push('/dashboard');
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Registration failed';
      toast.error(errorMsg);
      if (errorMsg.toLowerCase().includes('email')) {
        setErrors({ email: 'This email is already registered' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 px-4 py-10">
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
            <h2 className="text-3xl font-bold text-slate-900 text-center">Create your account</h2>
            <p className="text-center text-sm text-slate-600">Join Morongwa marketplace today</p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setRole('client')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  role === 'client'
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <UserCircle className={`h-8 w-8 mx-auto mb-2 ${role === 'client' ? 'text-blue-600' : 'text-slate-400'}`} />
                <div className="font-medium text-sm">Client</div>
                <div className="text-xs text-slate-500 mt-1">Post tasks</div>
              </button>

              <button
                type="button"
                onClick={() => setRole('runner')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  role === 'runner'
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Package className={`h-8 w-8 mx-auto mb-2 ${role === 'runner' ? 'text-blue-600' : 'text-slate-400'}`} />
                <div className="font-medium text-sm">Runner</div>
                <div className="text-xs text-slate-500 mt-1">Earn money</div>
              </button>

              <button
                type="button"
                onClick={() => setRole('both')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  role === 'both'
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <UserCircle className={`h-6 w-6 ${role === 'both' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <Package className={`h-6 w-6 -ml-2 ${role === 'both' ? 'text-blue-600' : 'text-slate-400'}`} />
                </div>
                <div className="font-medium text-sm">Both</div>
                <div className="text-xs text-slate-500 mt-1">Do it all</div>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (errors.name) setErrors({ ...errors, name: undefined });
                    }}
                    className={`block w-full pl-10 pr-3 py-3 border rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 transition ${
                      errors.name ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
                    }`}
                    placeholder="John Doe"
                    aria-invalid={!!errors.name}
                  />
                </div>
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.name}
                  </p>
                )}
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
                    autoComplete="new-password"
                    required
                    minLength={8}
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
                {password && password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">Strength:</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPasswordStrength(password).bg} ${getPasswordStrength(password).color}`}>
                        {getPasswordStrength(password).label}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {[
                        { label: '8+ characters', valid: password.length >= 8 },
                        { label: 'Uppercase', valid: /[A-Z]/.test(password) },
                        { label: 'Lowercase', valid: /[a-z]/.test(password) },
                        { label: 'Number', valid: /[0-9]/.test(password) },
                      ].map(({ label, valid }) => (
                        <div key={label} className="flex items-center gap-1 text-xs">
                          {valid ? (
                            <CheckCircle className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-slate-400" />
                          )}
                          <span className={valid ? 'text-emerald-600' : 'text-slate-500'}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 text-blue-600 rounded"
                  checked={acceptTos}
                  onChange={(e) => setAcceptTos(e.target.checked)}
                />
                <span>
                  I agree to the <Link href="/policies/terms-of-service" className="text-blue-600 hover:underline">Terms of Service</Link>
                </span>
              </label>

              <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 text-blue-600 rounded"
                  checked={acceptPrivacy}
                  onChange={(e) => setAcceptPrivacy(e.target.checked)}
                />
                <span>
                  I have read the <Link href="/policies/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</Link>
                </span>
              </label>

              {errors.consent && (
                <p className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.consent}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:from-blue-400 disabled:to-indigo-400 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    Creating account...
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>

            <div className="text-sm text-center text-slate-600">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
