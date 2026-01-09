"use client";

import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

function initials(name: string) {
  if (!name) return "M";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

export default function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const roles = Array.isArray(user.role) ? user.role : [user.role];
  const hasMultipleRoles = roles.length > 1;

  const dashboardHref = roles.includes('admin') || roles.includes('superadmin')
    ? '/admin'
    : hasMultipleRoles
    ? '/dashboard'
    : roles.includes('runner')
    ? '/dashboard/runner'
    : '/dashboard/client';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-600">Morongwa</p>
              <h1 className="text-3xl font-semibold text-slate-900">Your profile</h1>
              <p className="text-slate-600 mt-2">Stay trusted. Stay ready to trade securely.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href={dashboardHref}
                className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-sky-200 transition hover:scale-[1.01]"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/90 via-cyan-500/90 to-teal-500/80 text-xl font-semibold text-white shadow-lg shadow-sky-200">
                      {initials(user.name)}
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.2em] text-sky-600">Morongwa</p>
                      <h2 className="text-2xl font-semibold text-slate-900">{user.name}</h2>
                      <p className="text-slate-600">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700">
                    <ShieldCheck className="h-4 w-4" />
                    {roles.map(r => r.toUpperCase()).join(' + ')} role{roles.length > 1 ? 's' : ''}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-100 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{user.suspended ? "Suspended" : user.active ? "Active" : "Inactive"}</p>
                    <p className="text-xs text-slate-500">Account state</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Verification</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{user.isVerified ? "Verified" : "Pending"}</p>
                    <p className="text-xs text-slate-500">Identity status</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white/80 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Joined</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{new Date(user.createdAt).toLocaleDateString()}</p>
                    <p className="text-xs text-slate-500">Member since</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-sky-50 backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/90 via-cyan-500/90 to-teal-500/80 text-white shadow-md">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Profile</p>
                      <h3 className="text-lg font-semibold text-slate-900">Account snapshot</h3>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      Stay verified to unlock seamless payments.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      Keep your details fresh for faster trust.
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-teal-400" />
                      Need changes? Reach out via Support.
                    </li>
                  </ul>
                  <Link
                    href="/support"
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-sky-700 hover:text-sky-800"
                  >
                    Open a support ticket
                    <Sparkles className="h-4 w-4" />
                  </Link>
                </div>

                <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-sky-50 backdrop-blur">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Navigation</p>
                      <h3 className="text-lg font-semibold text-slate-900">Quick links</h3>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                      <Sparkles className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Link
                      href={dashboardHref}
                      className="group rounded-xl border border-slate-100 bg-white/80 p-3 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-sky-200 hover:shadow-md"
                    >
                      <span className="block">Go to dashboard</span>
                      <span className="text-xs text-slate-500 group-hover:text-sky-600">Stay on top of tasks</span>
                    </Link>
                    <Link
                      href="/wallet"
                      className="group rounded-xl border border-slate-100 bg-white/80 p-3 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-sky-200 hover:shadow-md"
                    >
                      <span className="block">Wallet & payments</span>
                      <span className="text-xs text-slate-500 group-hover:text-sky-600">Manage your funds</span>
                    </Link>
                    <Link
                      href="/tasks"
                      className="group rounded-xl border border-slate-100 bg-white/80 p-3 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-sky-200 hover:shadow-md"
                    >
                      <span className="block">Browse tasks</span>
                      <span className="text-xs text-slate-500 group-hover:text-sky-600">Find the right fit</span>
                    </Link>
                    <Link
                      href="/support"
                      className="group rounded-xl border border-slate-100 bg-white/80 p-3 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-1 hover:border-sky-200 hover:shadow-md"
                    >
                      <span className="block">Get help</span>
                      <span className="text-xs text-slate-500 group-hover:text-sky-600">We respond quickly</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-lg shadow-sky-50 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Morongwa pulse</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">Trust indicators</h3>
                <p className="text-sm text-slate-600">
                  Keep your profile tidy. Verified accounts get faster matches and quicker payouts.
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    Email status: {user.isVerified ? "Verified" : "Pending"}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-400" />
                    Role{roles.length > 1 ? 's' : ''}: {roles.join(', ')}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" />
                    Account: {user.suspended ? "Suspended" : user.active ? "Active" : "Inactive"}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-6 text-white shadow-xl shadow-sky-200">
                <p className="text-xs uppercase tracking-[0.25em]">Stay protected</p>
                <h3 className="mt-2 text-xl font-semibold">Keep your sessions secure</h3>
                <p className="mt-2 text-sm text-white/80">
                  Remember to log out on shared devices. If you spot anything unusual, let us know immediately.
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                  <Link
                    href="/support"
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 backdrop-blur transition hover:bg-white/20"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Report an issue
                  </Link>
                  <button
                    onClick={logout}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-slate-900 shadow-sm transition hover:shadow"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
