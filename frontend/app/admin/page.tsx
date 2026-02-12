'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Package,
  DollarSign,
  Activity,
  LogOut,
  Shield,
  Loader2,
  ArrowRight,
  Settings,
  Wallet,
  FileText,
  Mail,
  Lock,
  AlertCircle,
  Home,
  Building2,
  ShoppingBag,
  LayoutGrid,
} from 'lucide-react';
import toast from 'react-hot-toast';

const ADMIN_ROLES = ['admin', 'superadmin'];

function isAdmin(user: { role?: string | string[] } | null): boolean {
  if (!user?.role) return false;
  const roles = Array.isArray(user.role) ? user.role : [user.role];
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

/** Admin sign-in form shown at /admin when not logged in */
function AdminLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { login } = useAuth();
  const router = useRouter();

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: { email?: string; password?: string } = {};
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
      toast.success('Signed in');
      router.push('/admin');
      router.refresh();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Login failed';
      toast.error(msg);
      if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('user')) setErrors({ email: 'No account found with this email' });
      else if (msg.toLowerCase().includes('password')) setErrors({ password: 'Incorrect password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-50 text-slate-800 px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-slate-200/20 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-600 text-white mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <p className="text-xs uppercase tracking-widest text-sky-600 font-semibold">Morongwa</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Admin sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Sign in with an admin or superadmin account</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((e2) => ({ ...e2, email: undefined })); }}
                  className={`block w-full pl-10 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    errors.email ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                  placeholder="admin@morongwa.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {errors.email}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((e2) => ({ ...e2, password: undefined })); }}
                  className={`block w-full pl-10 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    errors.password ? 'border-red-300 bg-red-50' : 'border-slate-200'
                  }`}
                  placeholder="••••••••"
                />
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> {errors.password}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 text-sm font-semibold rounded-lg text-white bg-sky-600 hover:bg-sky-700 focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight className="h-5 w-5" />}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href="/login" className="text-sky-600 hover:underline">User login</Link>
            {' · '}
            <Link href="/" className="text-sky-600 hover:underline">Home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Shown when logged in but user is not admin/superadmin */
function AdminAccessDenied() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 via-white to-sky-50 text-slate-800 px-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 mb-4">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">You don’t have permission to view the admin area.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <ArrowRight className="h-4 w-4" />
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await adminAPI.getStats();
      setStats(response.data);
    } catch (error: any) {
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <Shield className="h-4 w-4 text-sky-500" />
              <span>Admin headquarters</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Welcome, {user?.name}</h1>
            <p className="text-slate-600">Platform oversight. Verify trust. Scale growth.</p>
          </div>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:scale-[1.01]"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total users', value: stats?.totalUsers ?? 0, active: stats?.activeUsers ?? 0, icon: Users, accent: 'from-sky-50 to-white', color: 'text-sky-600', href: '/admin/users' },
            { label: 'Total tasks', value: stats?.totalTasks ?? 0, active: stats?.completedTasks ?? 0, sub: 'completed', icon: Package, accent: 'from-emerald-50 to-white', color: 'text-emerald-600', href: '/admin/tasks' },
            { label: 'Total revenue', value: `R${Number(stats?.totalRevenue || 0).toFixed(2)}`, active: stats?.fnbBalance != null ? `Balance R${Number(stats.fnbBalance).toFixed(2)}` : '—', icon: DollarSign, accent: 'from-purple-50 to-white', color: 'text-purple-600' },
            { label: 'Escrow / Payouts', value: `${stats?.escrowHeld ?? 0} held`, active: `${stats?.escrowPendingPayoutCount ?? 0} pending · R${Number(stats?.pendingPayoutAmount || 0).toFixed(2)}`, icon: Activity, accent: 'from-orange-50 to-white', color: 'text-orange-600', href: '/admin/escrows' }
          ].map((card) => {
            const IconComponent = card.icon;
            const cardContent = (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
                  <p className={`text-xs mt-1 font-semibold ${card.color}`}>{card.active}</p>
                </div>
                <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                  <IconComponent className={`h-10 w-10 ${card.color}`} />
                </div>
              </div>
            );
            const cardClass = `rounded-2xl border border-white/60 bg-gradient-to-br ${card.accent} p-5 shadow-lg shadow-sky-50 backdrop-blur ${(card as any).href ? 'cursor-pointer hover:shadow-xl hover:-translate-y-0.5 transition-all' : ''}`;
            return (card as any).href ? (
              <Link key={card.label} href={(card as any).href} className={cardClass}>
                {cardContent}
              </Link>
            ) : (
              <div key={card.label} className={cardClass}>
                {cardContent}
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Tools</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Quick actions</h2>
            </div>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">Admin tools</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { href: '/admin/users', icon: Users, title: 'Manage users', desc: 'View, suspend, activate accounts', color: 'sky' },
              { href: '/admin/tasks', icon: Package, title: 'Manage tasks', desc: 'Monitor & cancel tasks', color: 'emerald' },
              { href: '/admin/suppliers', icon: Building2, title: 'Suppliers / Sellers', desc: 'Verify company & individual sellers', color: 'cyan' },
              { href: '/admin/orders', icon: ShoppingBag, title: 'Marketplace orders', desc: 'Checkout & wallet orders', color: 'purple' },
              { href: '/admin/products', icon: Package, title: 'Marketplace products', desc: 'Load and manage products for sale', color: 'emerald' },
              { href: '/admin/stores', icon: Building2, title: 'Stores', desc: 'Create and manage supplier/reseller stores', color: 'cyan' },
              { href: '/admin/reseller', icon: LayoutGrid, title: 'Reseller stats', desc: 'Walls and products on walls', color: 'indigo' },
              { href: '/admin/escrows', icon: DollarSign, title: 'View escrow & ledger', desc: 'Escrow list, full ledger, release, refund', color: 'orange' },
              { href: '/admin/payouts', icon: Wallet, title: 'FNB payouts', desc: 'Initiate payouts, poll status, view balance', color: 'orange' },
              { href: '/admin/audit', icon: FileText, title: 'Audit log', desc: 'Role-based actions & audit trail', color: 'indigo' },
              { href: '/admin/pricing', icon: Settings, title: 'Pricing config', desc: 'Manage fees & FX rates', color: 'cyan' }
            ].map((action) => {
              const IconComponent = action.icon;
              const colorMap: any = { 
                sky: 'text-sky-600', 
                emerald: 'text-emerald-600', 
                purple: 'text-purple-600', 
                orange: 'text-orange-600', 
                red: 'text-red-600', 
                indigo: 'text-indigo-600',
                cyan: 'text-cyan-600'
              };
              return (
                <Link key={action.href} href={action.href} className="group rounded-xl border border-slate-100 bg-white/90 p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                  <div className="mb-3 flex items-center justify-between">
                    <IconComponent className={`h-10 w-10 ${colorMap[action.color]}`} />
                    <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:text-sky-600" />
                  </div>
                  <h3 className="font-semibold text-slate-900">{action.title}</h3>
                  <p className="text-xs text-slate-600 mt-1">{action.desc}</p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Feed</p>
              <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
            </div>
          </div>
          <div className="mt-4">
            {stats?.recentActivity?.length > 0 ? (
              <div className="space-y-3">
                {stats.recentActivity.map((activity: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white/80 p-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-sky-500 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{activity.message}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(activity.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600">
                <Activity className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/** /admin gate: show login when not signed in, access denied when not admin, dashboard when admin */
export default function AdminPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!user) {
    return <AdminLoginForm />;
  }

  if (!isAdmin(user)) {
    return <AdminAccessDenied />;
  }

  return <AdminDashboard />;
}
