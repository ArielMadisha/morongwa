'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { User } from '@/lib/types';
import {
  ArrowLeft,
  Users,
  Search,
  UserCheck,
  UserX,
  Loader2,
  Ban,
  CheckCircle,
  Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

const hasRole = (r: unknown, v: string) => (Array.isArray(r) ? r.includes(v) : r === v);

function UsersManagement() {
  const PAGE_SIZE = 100;
  const { user: currentUser } = useAuth();
  const isSuperAdmin = hasRole(currentUser?.role, 'superadmin');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterRegistrationSource, setFilterRegistrationSource] = useState<'all' | 'whatsapp'>('all');
  const [waMetrics, setWaMetrics] = useState<{
    whatsappRegistered?: { total: number; active: number; suspended: number; newLast30d: number };
    whatsappActivity?: { walletActiveUsers: number; loginsLast7d: number };
  } | null>(null);

  useEffect(() => {
    fetchUsers(1);
  }, []);

  const fetchUsers = async (targetPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const response = await adminAPI.getAllUsers({ page: targetPage, limit: PAGE_SIZE });
      const list = response.data?.users ?? response.data;
      const next = Array.isArray(list) ? list : [];
      setUsers((prev) => (append ? [...prev, ...next] : next));
      const pagination = response.data?.pagination;
      setWaMetrics((response.data?.metrics || null) as any);
      const pages = Number(pagination?.pages || 1);
      const currentPage = Number(pagination?.page || targetPage || 1);
      const total = Number(pagination?.total || next.length || 0);
      setTotalPages(Number.isFinite(pages) && pages > 0 ? pages : 1);
      setPage(Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1);
      setTotalUsers(Number.isFinite(total) && total >= 0 ? total : 0);
    } catch (error) {
      toast.error('Failed to load users');
      if (!append) setUsers([]);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const handleSuspend = async (userId: string) => {
    if (!confirm('Are you sure you want to suspend this user?')) return;
    
    try {
      await adminAPI.suspendUser(userId);
      toast.success('User suspended successfully');
      fetchUsers(page);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to suspend user');
    }
  };

  const handleActivate = async (userId: string) => {
    try {
      await adminAPI.activateUser(userId);
      toast.success('User activated successfully');
      fetchUsers(page);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to activate user');
    }
  };

  const handleDelete = async (userId: string, displayName: string) => {
    if (
      !confirm(
        `Permanently delete "${displayName}"? This cannot be undone.\n\nAllowed only if the user has no orders, errands, wallet history, or supplier profile. Admin accounts cannot be deleted here.`
      )
    ) {
      return;
    }
    if (!confirm(`Second confirmation: delete ${displayName} permanently?`)) return;
    try {
      await adminAPI.deleteUser(userId);
      toast.success('User deleted');
      const targetPage = users.length === 1 && page > 1 ? page - 1 : page;
      fetchUsers(targetPage);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not delete user');
    }
  };

  const userList = Array.isArray(users) ? users : [];
  const filteredUsers = userList.filter(user => {
    const matchesSearch = (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || hasRole(user.role, filterRole);
    const isWhatsappRegistered = /@morongwa\.local$/i.test(user.email || '');
    const matchesRegistrationSource = filterRegistrationSource === 'all' || isWhatsappRegistered;
    return matchesSearch && matchesRole && matchesRegistrationSource;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Qwertymates</p>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">User management</h1>
            <p className="mt-1 text-sm text-slate-600">
              View, suspend, activate. Superadmins can permanently delete eligible accounts (no orders/tasks/wallet/supplier; not staff).
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Showing {users.length} of {totalUsers} users (page {page} of {totalPages}, {PAGE_SIZE} per page)
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to admin
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white/80 pl-10 pr-4 py-2 text-sm transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">All roles</option>
              <option value="client">Clients</option>
              <option value="runner">Runners</option>
              <option value="admin">Admins</option>
            </select>
            <select
              value={filterRegistrationSource}
              onChange={(e) => setFilterRegistrationSource(e.target.value as 'all' | 'whatsapp')}
              className="rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
            >
              <option value="all">All registrations</option>
              <option value="whatsapp">WhatsApp registrations only</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white/90">
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-slate-100">
                <thead className="bg-white/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Rating
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white/80">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user._id} className="transition hover:bg-white/95">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-100 to-cyan-50 text-sm font-semibold text-sky-700">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{user.name}</p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            hasRole(user.role, 'admin') ? 'bg-purple-100 text-purple-800' :
                            hasRole(user.role, 'runner') ? 'bg-emerald-100 text-emerald-800' :
                            'bg-sky-100 text-sky-800'
                          }`}>
                              {Array.isArray(user.role) ? user.role.join(', ') : user.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          {user.suspended ? (
                            <span className="flex items-center gap-1 text-red-600">
                              <UserX className="h-4 w-4" />
                              Suspended
                            </span>
                          ) : user.active ? (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <UserCheck className="h-4 w-4" />
                              Active
                            </span>
                          ) : (
                            <span className="text-slate-500">Inactive</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">
                          {(user.rating ?? 0) > 0 ? `${(user.rating ?? 0).toFixed(1)} ⭐` : '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-semibold">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {user.suspended ? (
                              <button
                                type="button"
                                onClick={() => handleActivate(user._id)}
                                className="inline-flex items-center gap-1 text-emerald-600 transition hover:text-emerald-700"
                              >
                                <CheckCircle className="h-4 w-4" />
                                Activate
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSuspend(user._id)}
                                className="inline-flex items-center gap-1 text-red-600 transition hover:text-red-700"
                              >
                                <Ban className="h-4 w-4" />
                                Suspend
                              </button>
                            )}
                            {isSuperAdmin &&
                            !hasRole(user.role, 'admin') &&
                            !hasRole(user.role, 'superadmin') ? (
                              <button
                                type="button"
                                onClick={() => handleDelete(user._id, user.name || user.email || 'User')}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                                title="Delete user permanently (superadmin only)"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white/70 px-4 py-3">
              <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchUsers(page - 1)}
                  disabled={page <= 1 || loading || loadingMore}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous page
                </button>
                <button
                  type="button"
                  onClick={() => fetchUsers(page + 1)}
                  disabled={page >= totalPages || loading || loadingMore}
                  className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                >
                  Next page
                </button>
                <button
                  type="button"
                  onClick={() => fetchUsers(page + 1, true)}
                  disabled={page >= totalPages || loading || loadingMore}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load more
                </button>
              </div>
            </div>
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { label: 'Loaded users', value: users.length, icon: Users, accent: 'sky' },
            { label: 'Clients', value: users.filter((u) => hasRole(u.role, 'client')).length, icon: Users, accent: 'emerald' },
            { label: 'Runners', value: users.filter((u) => hasRole(u.role, 'runner')).length, icon: Users, accent: 'cyan' },
            { label: 'Suspended', value: users.filter((u) => u.suspended).length, icon: Ban, accent: 'red' }
          ].map((stat) => {
            const accentColors: any = {
              sky: 'from-sky-50 to-white text-sky-600',
              emerald: 'from-emerald-50 to-white text-emerald-600',
              cyan: 'from-cyan-50 to-white text-cyan-600',
              red: 'from-red-50 to-white text-red-600'
            };
            return (
              <div key={stat.label} className={`rounded-2xl border border-white/60 bg-gradient-to-br ${accentColors[stat.accent]} shadow-lg shadow-sky-50 backdrop-blur p-5`}>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            { label: 'WhatsApp registered', value: waMetrics?.whatsappRegistered?.total ?? 0, accent: 'sky' },
            { label: 'WA active wallets', value: waMetrics?.whatsappActivity?.walletActiveUsers ?? 0, accent: 'emerald' },
            { label: 'WA logins (7d)', value: waMetrics?.whatsappActivity?.loginsLast7d ?? 0, accent: 'cyan' },
            { label: 'WA new (30d)', value: waMetrics?.whatsappRegistered?.newLast30d ?? 0, accent: 'sky' },
            { label: 'WA active accounts', value: waMetrics?.whatsappRegistered?.active ?? 0, accent: 'emerald' },
            { label: 'WA suspended', value: waMetrics?.whatsappRegistered?.suspended ?? 0, accent: 'red' }
          ].map((stat) => {
            const accentColors: any = {
              sky: 'from-sky-50 to-white text-sky-600',
              emerald: 'from-emerald-50 to-white text-emerald-600',
              cyan: 'from-cyan-50 to-white text-cyan-600',
              red: 'from-red-50 to-white text-red-600'
            };
            return (
              <div key={stat.label} className={`rounded-2xl border border-white/60 bg-gradient-to-br ${accentColors[stat.accent]} shadow-lg shadow-sky-50 backdrop-blur p-5`}>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default function ProtectedUsersManagement() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <UsersManagement />
    </ProtectedRoute>
  );
}
