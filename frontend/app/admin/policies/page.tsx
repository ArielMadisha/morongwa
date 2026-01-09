'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { policiesAPI, PolicyContent } from '@/lib/policiesApi';
import { Settings, AlertCircle, Plus, Check, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface PolicyWithVersions extends PolicyContent {
  versions?: any[];
}

export default function AdminPoliciesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => {
    const has = (r: any) => Array.isArray(r) ? r.includes('admin') || r.includes('superadmin') : r === 'admin' || r === 'superadmin';
    if (user && !has(user.role)) {
      router.push('/dashboard');
      return;
    }
    loadPolicies();
  }, [user, router]);

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

  const handleEditPolicy = async (slug: string) => {
    try {
      const response = await policiesAPI.getPolicy(slug);
      const policy = response.data.data;
      setSelectedPolicy(slug);
      setEditTitle(policy.title);
      setEditContent(policy.content);
      setEditMode(true);
    } catch (error) {
      toast.error('Failed to load policy for editing');
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedPolicy) return;
    try {
      await policiesAPI.createVersion(selectedPolicy, {
        title: editTitle,
        content: editContent,
        publish: false,
      });
      toast.success('Draft saved successfully');
    } catch (error) {
      toast.error('Failed to save draft');
    }
  };

  const handlePublish = async () => {
    if (!selectedPolicy) return;
    try {
      const response = await policiesAPI.createVersion(selectedPolicy, {
        title: editTitle,
        content: editContent,
        publish: true,
      });
      toast.success('Policy published successfully');
      setEditMode(false);
      loadPolicies();
    } catch (error) {
      toast.error('Failed to publish policy');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <p className="text-slate-600">Loading policies...</p>
      </div>
    );
  }

  const has2 = (r: any) => Array.isArray(r) ? r.includes('admin') || r.includes('superadmin') : r === 'admin' || r === 'superadmin';
  if (!user || !has2(user.role)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600">Unauthorized access</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-sky-600" />
            <h1 className="text-3xl font-bold text-slate-900">Policy Management</h1>
          </div>
          <p className="text-slate-600">Edit, draft, and publish policies</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {editMode && selectedPolicy ? (
          // Edit Mode
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Editing: {editTitle}</h2>
              <button
                onClick={() => {
                  setEditMode(false);
                  setSelectedPolicy(null);
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                ✕ Close
              </button>
            </div>

            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">Content (Markdown)</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={20}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-sky-500 font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">Supports Markdown formatting</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveDraft}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    <Clock className="h-4 w-4" />
                    Save Draft
                  </button>
                  <button
                    onClick={handlePublish}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    Publish
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // List Mode
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              {policies.map((policy) => (
                <div key={policy.slug} className="bg-white rounded-xl p-6 border border-slate-100 hover:border-sky-200 transition-colors">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{policy.title}</h3>
                  <p className="text-sm text-slate-600 mb-4 line-clamp-2">{policy.summary}</p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-sky-100 text-sky-700 text-xs rounded capitalize">
                      {policy.category}
                    </span>
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded">v{policy.latestPublishedVersion}</span>
                  </div>

                  <button
                    onClick={() => handleEditPolicy(policy.slug)}
                    className="w-full px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors text-sm font-medium"
                  >
                    Edit Policy
                  </button>
                </div>
              ))}
            </div>

            {policies.length === 0 && (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No policies found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
