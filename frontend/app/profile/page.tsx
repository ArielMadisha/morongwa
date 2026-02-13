"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutDashboard, Wallet, ClipboardList, HelpCircle, ShieldCheck } from "lucide-react";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar, AppSidebarMenuButton } from "@/components/AppSidebar";
import { useCartAndStores } from "@/lib/useCartAndStores";

function initials(name: string) {
  if (!name) return "M";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  if (!user) return null;

  const roles = Array.isArray(user.role) ? user.role : [user.role];
  const statusLabel = user.suspended ? "Suspended" : user.active ? "Active" : "Inactive";
  const variant = roles.includes("runner") ? "runner" : "client";

  const dashboardHref = roles.includes("admin") || roles.includes("superadmin")
    ? "/admin"
    : roles.length > 1
    ? "/dashboard"
    : roles.includes("runner")
    ? "/dashboard/runner"
    : "/dashboard/client";

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
        <AppSidebar
          variant={variant}
          userName={user?.name}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={logout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
            <div className="px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <Link
                  href={dashboardHref}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to dashboard
                </Link>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">My profile</h1>
            <p className="text-slate-600 mt-1">The Digital Home for Doers, Sellers & Creators.</p>
          </div>

          {/* Profile card */}
          <div className="rounded-2xl bg-white border border-slate-100 shadow-lg shadow-blue-900/5 overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-2xl font-semibold text-white">
                  {initials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold text-slate-900">{user.name}</h2>
                  <p className="text-slate-600">{user.email}</p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                    <ShieldCheck className="h-4 w-4" />
                    {roles.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(" + ")}
                  </div>
                </div>
              </div>

              {/* Status row */}
              <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{statusLabel}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Verification</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {user.isVerified ? "Verified" : "Pending"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Joined</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Quick links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                href={dashboardHref}
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Dashboard</p>
                  <p className="text-sm text-slate-500">Stay on top of tasks</p>
                </div>
              </Link>
              <Link
                href="/wallet"
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Wallet & payments</p>
                  <p className="text-sm text-slate-500">Manage your funds</p>
                </div>
              </Link>
              <Link
                href="/wall"
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Browse tasks</p>
                  <p className="text-sm text-slate-500">Find the right fit</p>
                </div>
              </Link>
              <Link
                href="/support"
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">Get help</p>
                  <p className="text-sm text-slate-500">Support & contact</p>
                </div>
              </Link>
            </div>
          </div>

          {/* Security tip */}
          <div className="mt-8 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Stay secure:</span> Log out on shared devices.
              Spot something unusual?{" "}
              <Link href="/support" className="font-medium text-blue-600 hover:text-blue-700">
                Report an issue
              </Link>
            </p>
          </div>
        </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
