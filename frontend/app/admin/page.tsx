'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Package,
  DollarSign,
  MessageSquare,
  AlertCircle,
  TrendingUp,
  Activity,
  LogOut,
  Shield,
  Loader2,
  ArrowRight,
  Settings
} from 'lucide-react';
import toast from 'react-hot-toast';

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
            { label: 'Total users', value: stats?.totalUsers || 0, active: stats?.activeUsers || 0, icon: Users, accent: 'from-sky-50 to-white', color: 'text-sky-600' },
            { label: 'Total tasks', value: stats?.totalTasks || 0, active: stats?.activeTasks || 0, icon: Package, accent: 'from-emerald-50 to-white', color: 'text-emerald-600' },
            { label: 'Total revenue', value: `R${(stats?.totalRevenue || 0).toFixed(2)}`, active: `+${stats?.revenueGrowth || 0}%`, icon: DollarSign, accent: 'from-purple-50 to-white', color: 'text-purple-600' },
            { label: 'Pending payouts', value: `R${(stats?.pendingPayouts || 0).toFixed(2)}`, active: `${stats?.pendingPayoutCount || 0} req`, icon: Activity, accent: 'from-orange-50 to-white', color: 'text-orange-600' }
          ].map((card) => {
            const IconComponent = card.icon;
            return (
              <div key={card.label} className={`rounded-2xl border border-white/60 bg-gradient-to-br ${card.accent} p-5 shadow-lg shadow-sky-50 backdrop-blur`}>
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
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">7 sections</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              { href: '/admin/users', icon: Users, title: 'Manage users', desc: 'View, suspend, activate accounts', color: 'sky' },
              { href: '/admin/tasks', icon: Package, title: 'Manage tasks', desc: 'Monitor & moderate platform tasks', color: 'emerald' },
              { href: '/admin/payouts', icon: DollarSign, title: 'Approve payouts', desc: 'Process withdrawal requests', color: 'purple' },
              { href: '/admin/support', icon: MessageSquare, title: 'Support tickets', desc: 'Respond to user requests', color: 'orange' },
              { href: '/admin/disputes', icon: AlertCircle, title: 'Resolve disputes', desc: 'Handle task/payment disputes', color: 'red' },
              { href: '/admin/analytics', icon: TrendingUp, title: 'View analytics', desc: 'Platform metrics & insights', color: 'indigo' },
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

export default function ProtectedAdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
