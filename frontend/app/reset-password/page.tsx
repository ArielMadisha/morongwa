"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Lock } from "lucide-react";
import AuthBackground from "@/components/AuthBackground";
import { passwordAPI } from "@/lib/api";

function ResetPasswordPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = useMemo(() => String(params.get("token") || "").trim(), [params]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("Missing or invalid reset token");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await passwordAPI.reset(token, password);
      toast.success(res.data?.message || "Password reset successful");
      setDone(true);
      setTimeout(() => router.push("/login"), 1000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <AuthBackground />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900 text-center">Reset password</h1>
          <p className="mt-2 text-sm text-slate-600 text-center">Create a new password for your account.</p>

          {!token ? (
            <p className="mt-5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
              This reset link is invalid. Request a new password reset link.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                New password
                <div className="mt-1 relative">
                  <Lock className="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter new password"
                    required
                  />
                </div>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Confirm password
                <div className="mt-1 relative">
                  <Lock className="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Confirm new password"
                    required
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loading || done}
                className="w-full rounded-lg bg-blue-600 text-white py-3 font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                {done ? "Done" : loading ? "Resetting..." : "Reset password"}
              </button>
            </form>
          )}

          <div className="mt-5 text-center text-sm">
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Request new reset link
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="relative min-h-screen flex flex-col">
          <AuthBackground />
          <div className="relative z-10 flex-1 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl">
              <h1 className="text-2xl font-bold text-slate-900 text-center">Reset password</h1>
              <p className="mt-3 text-sm text-slate-600 text-center">Loading reset link...</p>
            </div>
          </div>
        </div>
      }
    >
      <ResetPasswordPageInner />
    </Suspense>
  );
}
