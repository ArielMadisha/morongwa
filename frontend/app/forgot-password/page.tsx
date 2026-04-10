"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Mail } from "lucide-react";
import AuthBackground from "@/components/AuthBackground";
import { passwordAPI } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState<"auto" | "email" | "sms" | "whatsapp">("auto");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) {
      toast.error("Enter your email or cellphone number");
      return;
    }
    setLoading(true);
    try {
      const res = await passwordAPI.forgot(value, channel);
      toast.success(res.data?.message || "If that account exists, a reset link has been sent");
      setSent(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <AuthBackground />
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white/95 p-8 shadow-xl">
          <h1 className="text-2xl font-bold text-slate-900 text-center">Forgot password</h1>
          <p className="mt-2 text-sm text-slate-600 text-center">
            Enter your account email or cellphone number. We will send a reset link by your preferred channel.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email or cellphone number
              <div className="mt-1 relative">
                <Mail className="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com or +2772..."
                  required
                />
              </div>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Delivery channel
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as "auto" | "email" | "sms" | "whatsapp")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="auto">Auto (recommended)</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 text-white py-3 font-semibold hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>

          {sent ? (
            <p className="mt-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              If that account exists, a reset link has been sent. Check your email/phone messages and spam folder.
            </p>
          ) : null}

          <div className="mt-5 text-center text-sm">
            <Link href="/login" className="text-blue-600 hover:underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
