'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { policiesAPI, PolicyContent } from '@/lib/policiesApi';
import Link from 'next/link';
import { ArrowLeft, Download, Clock, Tag, MapPin, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import SiteHeader from '@/components/SiteHeader';

export default function PolicyPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [policy, setPolicy] = useState<PolicyContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadPolicy();
  }, [slug]);

  const loadPolicy = async () => {
    try {
      const response = await policiesAPI.getPolicy(slug);
      setPolicy(response.data.data);
    } catch (error: unknown) {
      const is404 = typeof error === 'object' && error !== null && 'response' in error && (error as { response?: { status?: number } }).response?.status === 404;
      if (!is404) {
        console.error('Failed to load policy:', error);
        toast.error('Failed to load policy');
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    const link = document.createElement('a');
    link.href = `/api/policies/${slug}/pdf`;
    link.download = `${slug}.pdf`;
    link.click();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <p className="text-slate-600">Loading policy...</p>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Policy not found</p>
          <Link href="/policies" className="text-sky-600 hover:text-sky-700 font-medium">
            Back to policies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/policies" className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-4 text-sm font-medium">
          <ArrowLeft className="h-4 w-4" />
          Back to policies
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 mb-4">{policy.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span className="inline-block px-3 py-1 bg-sky-100 text-sky-700 rounded-full capitalize">
              {policy.category}
            </span>
            {policy.publishedAt && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {new Date(policy.publishedAt).toLocaleDateString()}
              </div>
            )}
            <span>v{policy.version}</span>
          </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Metadata */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Tags */}
          {policy.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {policy.tags.map((tag) => (
                  <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-700 text-xs rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Countries */}
          {policy.countryScope.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Scope
              </h3>
              <div className="flex flex-wrap gap-2">
                {policy.countryScope.map((country) => (
                  <span key={country} className="px-3 py-1 bg-slate-100 text-slate-700 text-xs rounded-full">
                    {country}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Actions</h3>
            <div className="flex gap-2">
              <button
                onClick={downloadPDF}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary */}
        {policy.summary && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
            <p className="text-blue-900 font-medium">{policy.summary}</p>
          </div>
        )}

        {/* Content */}
        <div className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-a:text-sky-600 hover:prose-a:text-sky-700 prose-code:bg-slate-100 prose-code:text-slate-900">
          <ReactMarkdown>{policy.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
