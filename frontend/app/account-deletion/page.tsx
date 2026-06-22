import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white text-slate-900">
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Qwertymates Account Deletion and Deactivation</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: 2026-04-15</p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">
            Qwertymates gives you two account options:
          </p>
          <ol className="mt-3 list-decimal pl-5 text-slate-700 space-y-1">
            <li>
              <strong>Deactivate account</strong> (temporary, reversible)
            </li>
            <li>
              <strong>Delete account</strong> (permanent, not reversible)
            </li>
          </ol>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">1) Deactivate account (temporary)</h2>
          <p className="mt-2 text-slate-700">
            Deactivation hides your account and pauses access until you reactivate.
          </p>
          <h3 className="mt-4 font-semibold">How to deactivate in the app</h3>
          <ol className="mt-2 list-decimal pl-5 text-slate-700 space-y-1">
            <li>Open Qwertymates.</li>
            <li>Go to Profile.</li>
            <li>Under "Take a break", choose a reason (optional feedback allowed).</li>
            <li>Tap "Deactivate account" and confirm.</li>
          </ol>
          <h3 className="mt-4 font-semibold">How to reactivate later</h3>
          <ol className="mt-2 list-decimal pl-5 text-slate-700 space-y-1">
            <li>Open Qwertymates login.</li>
            <li>Enter your account credentials.</li>
            <li>Tap "Reactivate account" when prompted.</li>
          </ol>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">2) Delete account (permanent)</h2>
          <p className="mt-2 text-slate-700">
            Permanent deletion closes your account and removes or anonymizes personal profile data. This action cannot be undone.
          </p>
          <h3 className="mt-4 font-semibold">How to permanently delete in the app</h3>
          <ol className="mt-2 list-decimal pl-5 text-slate-700 space-y-1">
            <li>Open Qwertymates.</li>
            <li>Go to Profile.</li>
            <li>Tap "Delete account".</li>
            <li>Confirm the deletion prompt.</li>
          </ol>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">3) What data is deleted vs retained</h2>
          <h3 className="mt-4 font-semibold">Deleted or anonymized</h3>
          <ul className="mt-2 list-disc pl-5 text-slate-700 space-y-1">
            <li>Name</li>
            <li>Email address</li>
            <li>Phone number</li>
            <li>Profile image/media references</li>
            <li>Profile fields where applicable</li>
          </ul>
          <h3 className="mt-4 font-semibold">May be retained for legal/security reasons</h3>
          <ul className="mt-2 list-disc pl-5 text-slate-700 space-y-1">
            <li>Completed order, payment, or financial records</li>
            <li>Audit/security logs required by law</li>
            <li>Records needed for fraud prevention, dispute handling, or compliance</li>
          </ul>
          <p className="mt-3 text-slate-700">Retention is limited to what is legally required.</p>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">4) Alternative request via support</h2>
          <p className="mt-2 text-slate-700">If you cannot access the app, contact support:</p>
          <ul className="mt-2 list-disc pl-5 text-slate-700 space-y-1">
            <li>
              Support page:{" "}
              <a className="text-sky-700 underline" href="https://www.qwertymates.com/support">
                https://www.qwertymates.com/support
              </a>
            </li>
            <li>Email: support@qwertymates.com</li>
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">5) Related policies</h2>
          <ul className="mt-2 list-disc pl-5 text-slate-700 space-y-1">
            <li>
              <Link className="text-sky-700 underline" href="/policies/privacy-policy">
                Privacy Policy
              </Link>
            </li>
            <li>
              <Link className="text-sky-700 underline" href="/policies/terms-of-service">
                Terms of Service
              </Link>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
