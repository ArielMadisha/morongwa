import SiteHeader from "@/components/SiteHeader";

export default function ChildSafetyStandardsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white text-slate-900">
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Qwertymates Child Safety Standards (CSAE)
        </h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: 2026-04-15</p>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">
            Qwertymates has zero tolerance for child sexual abuse and exploitation (CSAE),
            including child sexual abuse material (CSAM), grooming, and any content or behavior
            that exploits minors.
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Prohibited behavior and content</h2>
          <ul className="mt-3 list-disc pl-5 text-slate-700 space-y-1">
            <li>Any CSAM content (images, videos, audio, text, links, metadata).</li>
            <li>Sexual exploitation, grooming, coercion, or solicitation of minors.</li>
            <li>Sharing or requesting sexualized content involving minors.</li>
            <li>Facilitating trafficking, abuse, or sexual exploitation of children.</li>
            <li>Any attempt to evade moderation or re-upload removed abusive content.</li>
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">How users can report</h2>
          <p className="mt-2 text-slate-700">
            Users can report abusive or unsafe content directly in-app using report controls on
            posts and can block accounts. Reports are reviewed and acted on by the platform.
          </p>
          <p className="mt-2 text-slate-700">
            If you cannot access the app, contact: <strong>support@qwertymates.com</strong>
          </p>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Enforcement actions</h2>
          <ul className="mt-3 list-disc pl-5 text-slate-700 space-y-1">
            <li>Immediate removal of violating content.</li>
            <li>Account suspension or permanent account termination.</li>
            <li>Preservation of evidence where legally required.</li>
            <li>Reporting to relevant authorities/NCMEC or regional equivalents as required by law.</li>
          </ul>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Legal compliance commitment</h2>
          <p className="mt-2 text-slate-700">
            Qwertymates complies with applicable child safety laws and platform policies, including
            Google Play child safety standards. We continuously improve preventive controls and
            moderation processes to protect minors on the platform.
          </p>
        </section>
      </main>
    </div>
  );
}
