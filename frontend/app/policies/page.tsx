'use client';

import { useEffect, useState } from 'react';
import { policiesAPI } from '@/lib/policiesApi';
import Link from 'next/link';
import { BookOpen, Download, Eye, Archive, Tag, MapPin, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';

interface Policy {
  slug: string;
  title: string;
  category: string;
  tags: string[];
  countryScope: string[];
  latestPublishedVersion: number;
  summary: string;
  publishedAt: string;
}

export default function PoliciesPage() {
  const { user } = useAuth();
  const { cartCount, hasStore } = useCartAndStores(!!user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      const response = await policiesAPI.listPublished();
      setPolicies(response.data.data);
    } catch (error) {
      console.error('Failed to load policies:', error);
      toast.error('Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  const filteredPolicies = policies.filter(
    (p) =>
      p.title.toLowerCase().includes(filter.toLowerCase()) ||
      p.category.toLowerCase().includes(filter.toLowerCase()) ||
      p.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
  );

  const categories = Array.from(new Set(policies.map((p) => p.category)));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <BookOpen className="h-12 w-12 text-sky-600 mx-auto animate-pulse" />
          <p className="text-slate-600">Loading policies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link href={user ? '/wall' : '/'} className="shrink-0 flex items-center" aria-label="Home">
                <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-9 w-9 object-contain lg:hidden" />
                <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-9 w-auto object-contain hidden lg:block" />
              </Link>
              {user && <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />}
            </div>
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-2 shrink-0">
              <SearchButton className="max-w-[200px] sm:max-w-[280px]" />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        {user && (
          <AppSidebar
            variant="wall"
            cartCount={cartCount}
            hasStore={hasStore}
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            hideLogo
            belowHeader
          />
        )}
      <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-8 w-8 text-sky-600" />
            <h1 className="text-3xl font-bold text-slate-900">Policies & Legal</h1>
          </div>
          <p className="text-slate-600">Review our policies, terms, and compliance documentation</p>
        </div>

        {/* About Qwertymates */}
        <Link
          href="/about"
          className="mb-8 flex items-center gap-4 p-4 rounded-xl bg-sky-50 border border-sky-100 hover:bg-sky-100/80 hover:border-sky-200 transition-colors group"
        >
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-sky-100 flex items-center justify-center group-hover:bg-sky-200 transition-colors">
            <Info className="h-6 w-6 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-900 group-hover:text-sky-700">About Qwertymates</h2>
            <p className="text-sm text-slate-600">Learn what Qwertymates is and how it works – marketplace, Errands, ACBPayWallet, Morongwa, QwertyTV, QwertyMusic, and more.</p>
          </div>
          <span className="text-sky-600 font-medium text-sm shrink-0">Read more →</span>
        </Link>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          <input
            type="text"
            placeholder="Search policies..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('')}
              className={`px-4 py-2 rounded-full transition-colors ${
                filter === ''
                  ? 'bg-sky-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-2 rounded-full transition-colors capitalize ${
                  filter.toLowerCase() === cat.toLowerCase()
                    ? 'bg-sky-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Policies Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {filteredPolicies.length === 0 ? (
            <div className="md:col-span-2 text-center py-12">
              <Archive className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">No policies found matching your search</p>
            </div>
          ) : (
            filteredPolicies.map((policy) => (
              <Link key={policy.slug} href={`/policies/${policy.slug}`}>
                <div className="group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all p-6 border border-slate-100 hover:border-sky-200 cursor-pointer h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
                        {policy.title}
                      </h3>
                      <span className="inline-block mt-2 px-3 py-1 bg-sky-100 text-sky-700 text-xs font-semibold rounded-full capitalize">
                        {policy.category}
                      </span>
                    </div>
                    <Eye className="h-5 w-5 text-slate-300 group-hover:text-sky-600 transition-colors" />
                  </div>

                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">{policy.summary}</p>

                  <div className="space-y-2 mb-4">
                    {policy.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {policy.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="flex items-center gap-1 text-xs text-slate-500">
                            <Tag className="h-3 w-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {policy.countryScope.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin className="h-3 w-3" />
                        <span>{policy.countryScope.join(', ')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <span className="text-xs text-slate-500">v{policy.latestPublishedVersion}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        const link = document.createElement('a');
                        link.href = `/api/policies/${policy.slug}/pdf`;
                        link.download = `${policy.slug}.pdf`;
                        link.click();
                      }}
                      className="flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 font-medium"
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </button>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
