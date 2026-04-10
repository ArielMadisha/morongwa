'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle,
  Calendar,
  Phone,
  MessageCircle,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import SiteHeader from '@/components/SiteHeader';
import AuthBackground from '@/components/AuthBackground';
import { authAPI } from '@/lib/api';

type Step = 'phone' | 'verify' | 'profile' | 'email';
type Mode = 'whatsapp' | 'sms' | 'email';

function readReturnToFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('returnTo');
}

function RegisterPageContent() {
  const [step, setStep] = useState<Step>('phone');
  const [mode, setMode] = useState<Mode>('whatsapp');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendingChannel, setSendingChannel] = useState<'sms' | 'whatsapp' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [acceptConsent, setAcceptConsent] = useState(false);
  const { register, registerWithOtp } = useAuth();
  const router = useRouter();

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const getMinBirthDate = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 13);
    return d.toISOString().split('T')[0];
  };

  const isAtLeast13 = (dob: string) => {
    if (!dob) return false;
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age >= 13;
  };

  const getPasswordStrength = (p: string) => {
    const checks = {
      minLength: p.length >= 8,
      hasUpper: /[A-Z]/.test(p),
      hasLower: /[a-z]/.test(p),
      hasNumber: /[0-9]/.test(p),
    };
    const score = Object.values(checks).filter(Boolean).length;
    if (score === 4) return { label: 'Strong', color: 'text-emerald-600', bg: 'bg-emerald-100' };
    if (score === 3) return { label: 'Good', color: 'text-cyan-600', bg: 'bg-cyan-100' };
    if (score >= 2) return { label: 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { label: 'Weak', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const handleSendOtp = async (channel: 'sms' | 'whatsapp') => {
    const normalized = phone.replace(/\D/g, '');
    if (normalized.length < 10) {
      setErrors({ phone: 'Enter a valid phone number' });
      return;
    }
    setErrors({});
    setSendingOtp(true);
    setSendingChannel(channel);
    setMode(channel);
    try {
      const healthRes = await authAPI.getOtpHealth();
      const health = healthRes.data?.data;
      if (!health?.configured && health?.mode === 'production') {
        toast.error('OTP service is not configured yet. Please contact support.');
        return;
      }
      if (channel === 'sms' && health?.configured && !health?.smsReady) {
        toast.error('SMS channel is not configured yet.');
        return;
      }
      if (channel === 'whatsapp' && health?.configured && !health?.whatsappReady) {
        toast.error('WhatsApp channel is not configured yet.');
        return;
      }
      await authAPI.sendOtp(phone, channel);
      toast.success(`OTP sent via ${channel === 'sms' ? 'SMS' : 'WhatsApp'}`);
      setStep('verify');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to send OTP');
    } finally {
      setSendingOtp(false);
      setSendingChannel(null);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setErrors({ otp: 'Enter the 6-digit code' });
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await authAPI.verifyOtp(phone, otp);
      setOtpToken(res.data.otpToken);
      setStep('profile');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = 'Name is required';
    else if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';

    if (!dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    else if (!isAtLeast13(dateOfBirth)) newErrors.dateOfBirth = 'You must be at least 13 years old';

    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (!acceptConsent) newErrors.consent = 'Please agree to continue';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix the errors');
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      if (otpToken && mode !== 'email') {
        await registerWithOtp!({
          name: name.trim(),
          password,
          dateOfBirth,
          otpToken,
          policyAcceptances: ['terms-of-service', 'privacy-policy'],
        });
      } else {
        await register(
          name.trim(),
          email.trim().toLowerCase(),
          password,
          ['client'],
          ['terms-of-service', 'privacy-policy'],
          dateOfBirth
        );
      }
      toast.success('🎉 Welcome to Qwertymates!');
      const returnTo = readReturnToFromWindow();
      const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/wall';
      router.push(target);
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Registration failed';
      toast.error(msg);
      if (msg.toLowerCase().includes('email')) setErrors({ email: 'Email already registered' });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!name.trim()) newErrors.name = 'Name is required';
    else if (name.trim().length < 2) newErrors.name = 'Name must be at least 2 characters';

    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!validateEmail(email)) newErrors.email = 'Please enter a valid email';

    if (!dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    else if (!isAtLeast13(dateOfBirth)) newErrors.dateOfBirth = 'You must be at least 13 years old';

    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';

    if (!acceptConsent) newErrors.consent = 'Please agree to continue';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix the errors');
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      await register(name.trim(), email.trim().toLowerCase(), password, ['client'], ['terms-of-service', 'privacy-policy'], dateOfBirth);
      toast.success('🎉 Welcome to Qwertymates!');
      const returnTo = readReturnToFromWindow();
      const target = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/wall';
      router.push(target);
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Registration failed';
      toast.error(msg);
      if (msg.toLowerCase().includes('email')) setErrors({ email: 'Email already registered' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (hasError: boolean) =>
    `block w-full pl-10 pr-3 py-3 border rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 transition ${
      hasError ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-slate-200 focus:ring-blue-500 focus:border-transparent'
    }`;

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden text-slate-900">
      <AuthBackground />
      <div className="relative z-10">
        <SiteHeader minimal />
      </div>
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10 text-slate-900">
            {/* Step 1: Phone */}
            {step === 'phone' && (
              <>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900 text-center">Create your account</h2>
                  <p className="text-center text-sm text-slate-600">Verify your phone via WhatsApp</p>
                </div>
                <div className="mt-8 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone number</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (errors.phone) setErrors({ ...errors, phone: '' });
                        }}
                        className={inputClass(!!errors.phone)}
                        placeholder="+27 82 123 4567"
                      />
                    </div>
                    {errors.phone && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.phone}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSendOtp('sms')}
                      disabled={sendingOtp}
                      className="flex-1 flex justify-center items-center gap-2 py-3 px-4 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold disabled:opacity-60"
                    >
                      {sendingOtp && sendingChannel === 'sms' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Smartphone className="h-5 w-5" />}
                      Send via SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendOtp('whatsapp')}
                      disabled={sendingOtp}
                      className="flex-1 flex justify-center items-center gap-2 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-60"
                    >
                      {sendingOtp && sendingChannel === 'whatsapp' ? <Loader2 className="h-5 w-5 animate-spin" /> : <MessageCircle className="h-5 w-5" />}
                      Send via WhatsApp
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 text-center">We&apos;ll send a 6-digit code to your phone.</p>
                  <button
                    type="button"
                    onClick={() => { setMode('email'); setStep('email'); }}
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-900 text-center transition-colors"
                  >
                    Or register with email →
                  </button>
                  <a
                    href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '27815826899'}?text=${encodeURIComponent('Hi, I want to register for Morongwa')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2 px-4 rounded-lg border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-semibold text-center transition-colors"
                  >
                    Or register via WhatsApp chat →
                  </a>
                </div>
              </>
            )}

            {/* Step 2: Verify OTP */}
            {step === 'verify' && (
              <>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900 text-center">Enter verification code</h2>
                  <p className="text-center text-sm text-slate-600">Sent to {phone}</p>
                </div>
                <div className="mt-8 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Enter OTP</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, ''));
                        if (errors.otp) setErrors({ ...errors, otp: '' });
                      }}
                      className={inputClass(!!errors.otp)}
                      placeholder="000000"
                    />
                    {errors.otp && (
                      <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {errors.otp}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={loading || otp.length !== 6}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    Verify & Continue
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="w-full text-sm text-slate-600 hover:text-blue-600"
                  >
                    ← Change phone number
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Profile (WhatsApp flow) */}
            {step === 'profile' && (
              <form onSubmit={handleProfileSubmit} className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900 text-center">Finish setting up your account</h2>
                  <p className="text-center text-sm text-slate-600">A username will be created from your name. You can edit it in Profile later.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        value={name}
                        onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: '' }); }}
                        className={inputClass(!!errors.name)}
                        placeholder="John Doe"
                      />
                    </div>
                    {errors.name && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of birth</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type="date"
                        max={getMinBirthDate()}
                        value={dateOfBirth}
                        onChange={(e) => { setDateOfBirth(e.target.value); if (errors.dateOfBirth) setErrors({ ...errors, dateOfBirth: '' }); }}
                        className={inputClass(!!errors.dateOfBirth)}
                      />
                    </div>
                    {errors.dateOfBirth && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.dateOfBirth}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: '' }); }}
                        className={inputClass(!!errors.password)}
                        placeholder="••••••••"
                      />
                    </div>
                    {password && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPasswordStrength(password).bg} ${getPasswordStrength(password).color}`}>
                        {getPasswordStrength(password).label}
                      </span>
                    )}
                    {errors.password && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.password}</p>}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="mt-1 h-4 w-4 text-blue-600 rounded" checked={acceptConsent} onChange={(e) => setAcceptConsent(e.target.checked)} />
                    <span>By clicking Create Account, you agree to our <Link href="/policies/terms-of-service" className="text-blue-600 hover:underline">Terms of Service</Link>, <Link href="/policies/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</Link> and <Link href="/policies/cookies-tracking" className="text-blue-600 hover:underline">Cookies Policy</Link>.</span>
                  </label>
                  {errors.consent && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.consent}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex justify-center items-center gap-2 w-full py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    Create Account
                  </button>
                </div>
              </form>
            )}

            {/* Email flow (legacy) */}
            {step === 'email' && (
              <form onSubmit={handleEmailSubmit} className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-slate-900 text-center">Create your account</h2>
                  <p className="text-center text-sm text-slate-600">Register with email</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input value={name} onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: '' }); }} className={inputClass(!!errors.name)} placeholder="John Doe" />
                    </div>
                    {errors.name && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of birth</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input type="date" max={getMinBirthDate()} value={dateOfBirth} onChange={(e) => { setDateOfBirth(e.target.value); if (errors.dateOfBirth) setErrors({ ...errors, dateOfBirth: '' }); }} className={inputClass(!!errors.dateOfBirth)} />
                    </div>
                    {errors.dateOfBirth && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.dateOfBirth}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: '' }); }} className={inputClass(!!errors.email)} placeholder="you@example.com" />
                    </div>
                    {errors.email && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.email}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                      <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: '' }); }} className={inputClass(!!errors.password)} placeholder="••••••••" />
                    </div>
                    {password && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getPasswordStrength(password).bg} ${getPasswordStrength(password).color}`}>{getPasswordStrength(password).label}</span>}
                    {errors.password && <p className="mt-1 text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.password}</p>}
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="mt-1 h-4 w-4 text-blue-600 rounded" checked={acceptConsent} onChange={(e) => setAcceptConsent(e.target.checked)} />
                    <span>By clicking Create Account, you agree to our <Link href="/policies/terms-of-service" className="text-blue-600 hover:underline">Terms of Service</Link>, <Link href="/policies/privacy-policy" className="text-blue-600 hover:underline">Privacy Policy</Link> and <Link href="/policies/cookies-tracking" className="text-blue-600 hover:underline">Cookies Policy</Link>.</span>
                  </label>
                  {errors.consent && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {errors.consent}</p>}
                  <button type="submit" disabled={loading} className="flex justify-center items-center gap-2 w-full py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold disabled:opacity-60">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    Create Account
                  </button>
                  <button type="button" onClick={() => { setMode('whatsapp'); setStep('phone'); }} className="w-full py-2.5 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-900 text-center">
                    ← Register with phone (SMS/WhatsApp) instead
                  </button>
                  <a
                    href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '27815826899'}?text=${encodeURIComponent('Hi, I want to register for Morongwa')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2 px-4 rounded-lg border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 font-semibold text-center"
                  >
                    Or register via WhatsApp chat →
                  </a>
                </div>
              </form>
            )}

            {(step === 'phone' || step === 'verify') && (
              <div className="mt-6 text-sm text-center text-slate-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">Sign in</Link>
              </div>
            )}
            {(step === 'profile' || step === 'email') && (
              <div className="mt-6 text-sm text-center text-slate-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">Sign in</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return <RegisterPageContent />;
}
