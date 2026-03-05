import Link from 'next/link';
import { Receipt, BookOpen, HelpCircle } from 'lucide-react';

const footerLinks = [
  { href: '/pricing', label: 'Pricing', icon: Receipt },
  { href: '/policies', label: 'Policies & Legal', icon: BookOpen },
  { href: '/support', label: 'Support', icon: HelpCircle },
];

export default function SiteFooter() {
  return (
    <footer className="w-full border-t border-slate-200 bg-white mt-10">
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="text-xl font-bold text-slate-900">Qwertymates</div>
          <nav className="flex flex-wrap items-center gap-6 text-sm">
            {footerLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="text-xs text-slate-500 border-t border-slate-200 pt-4">
          © {new Date().getFullYear()} Qwertymates. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
