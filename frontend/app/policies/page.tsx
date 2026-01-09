'use client';

import { useEffect, useState } from 'react';
import { policiesAPI } from '@/lib/policiesApi';
import Link from 'next/link';
import { BookOpen, Download, Eye, Archive, Tag, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

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
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="h-8 w-8 text-sky-600" />
            <h1 className="text-3xl font-bold text-slate-900">Policies & Legal</h1>
          </div>
          <p className="text-slate-600">Review our policies, terms, and compliance documentation</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
  );
}
