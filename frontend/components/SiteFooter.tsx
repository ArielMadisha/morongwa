import Link from 'next/link';
import { Package, Receipt, BookOpen, HelpCircle } from 'lucide-react';

const footerLinks = [
  { href: '/pricing', label: 'Pricing', icon: Receipt },
  { href: '/policies', label: 'Policies & Legal', icon: BookOpen },
  { href: '/support', label: 'Support', icon: HelpCircle },
];

export default function SiteFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2 text-white hover:text-sky-300 transition-colors">
            <Package className="h-6 w-6 text-sky-400" />
            <span className="font-bold">Morongwa</span>
          </Link>
          <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Footer navigation">
            {footerLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Morongwa. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
