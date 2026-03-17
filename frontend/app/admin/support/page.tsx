'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { supportAPI } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, HelpCircle, Loader2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { getSupportCategoryLabel, SUPPORT_CATEGORIES } from '@/lib/supportCategories';

interface SupportTicket {
  _id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  user?: { name?: string; email?: string };
  messages?: Array<{ sender?: { name?: string }; message: string; createdAt: string }>;
  createdAt: string;
  resolvedAt?: string;
  closedAt?: string;
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, pages: 1 });

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, categoryFilter]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await supportAPI.getAllTickets({
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        limit: 50,
      });
      const data = res.data as { tickets?: SupportTicket[]; pagination?: { total: number; page: number; limit: number; pages: number } };
      setTickets(Array.isArray(data?.tickets) ? data.tickets : []);
      setPagination(data?.pagination ?? { total: 0, page: 1, limit: 20, pages: 1 });
    } catch {
      toast.error('Failed to load support tickets');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTicketDetail = async (ticket: SupportTicket) => {
    if (selectedTicket?._id === ticket._id) {
      setSelectedTicket(null);
      setExpandedId(null);
      return;
    }
    try {
      const res = await supportAPI.getById(ticket._id);
      const t = (res.data as any)?.ticket;
      setSelectedTicket(t ?? ticket);
      setExpandedId(ticket._id);
    } catch {
      toast.error('Failed to load ticket details');
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyMessage.trim()) return;
    setSendingReply(true);
    try {
      await supportAPI.addMessage(selectedTicket._id, replyMessage.trim());
      toast.success('Reply sent');
      setReplyMessage('');
      const res = await supportAPI.getById(selectedTicket._id);
      setSelectedTicket((res.data as any)?.ticket);
      fetchTickets();
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleStatusChange = async (ticketId: string, status: string) => {
    setUpdatingStatus(ticketId);
    try {
      await supportAPI.updateStatus(ticketId, status);
      toast.success('Status updated');
      fetchTickets();
      if (selectedTicket?._id === ticketId) {
        setSelectedTicket((prev) => (prev ? { ...prev, status } : null));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const statusColors: Record<string, string> = {
    open: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-blue-100 text-blue-800',
    resolved: 'bg-emerald-100 text-emerald-800',
    closed: 'bg-slate-100 text-slate-600',
    escalated: 'bg-red-100 text-red-800',
  };
  const priorityColors: Record<string, string> = {
    low: 'text-slate-600',
    medium: 'text-sky-600',
    high: 'text-amber-600',
    urgent: 'text-red-600',
  };

  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-sky-600">Qwertymates</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Support tickets</h1>
              <p className="mt-1 text-sm text-slate-600">View and respond to user support requests.</p>
            </div>
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:shadow-md">
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-slate-700">Status:</span>
            {['', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
              <button
                key={s || 'all'}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  statusFilter === s ? 'bg-sky-600 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {s === '' ? 'All' : s === 'in_progress' ? 'In progress' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <span className="text-sm font-medium text-slate-700 ml-4">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All</option>
              {Object.entries(SUPPORT_CATEGORIES).map(([key, cat]) => (
                <optgroup key={key} label={cat.label}>
                  {cat.subcategories.map((sub) => (
                    <option key={sub.value} value={sub.value}>{sub.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-2">
                <HelpCircle className="h-12 w-12 text-slate-300" />
                No support tickets found.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <div key={ticket._id} className="hover:bg-slate-50/50">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer"
                      onClick={() => loadTicketDetail(ticket)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 truncate">{ticket.title}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[ticket.status] || 'bg-slate-100 text-slate-600'}`}>
                            {ticket.status?.replace('_', ' ')}
                          </span>
                          <span className={`text-xs font-medium ${priorityColors[ticket.priority] || ''}`}>
                            {ticket.priority}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mt-1 truncate">{ticket.description}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {ticket.user?.name || ticket.user?.email || 'Unknown'} · {getSupportCategoryLabel(ticket.category)} · {new Date(ticket.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {expandedId === ticket._id ? (
                        <ChevronUp className="h-5 w-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-400" />
                      )}
                    </div>

                    {expandedId === ticket._id && selectedTicket?._id === ticket._id && (
                      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                        <div className="space-y-3 max-h-64 overflow-y-auto">
                          <div className="flex gap-2">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-sm font-medium">
                              {(selectedTicket.user as any)?.name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-500">{(selectedTicket.user as any)?.name || 'User'} (original)</p>
                              <p className="text-sm text-slate-800">{selectedTicket.description}</p>
                              <p className="text-xs text-slate-400 mt-1">{new Date(selectedTicket.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                          {selectedTicket.messages?.map((msg, i) => (
                            <div key={i} className="flex gap-2">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 text-sm font-medium">
                                {(msg.sender as any)?.name?.[0] || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-slate-500">{(msg.sender as any)?.name || 'User'}</p>
                                <p className="text-sm text-slate-800">{msg.message}</p>
                                <p className="text-xs text-slate-400 mt-1">{new Date(msg.createdAt).toLocaleString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {['open', 'in_progress'].includes(selectedTicket.status) && (
                          <div className="mt-4 flex gap-2">
                            <input
                              type="text"
                              value={replyMessage}
                              onChange={(e) => setReplyMessage(e.target.value)}
                              placeholder="Type your reply..."
                              className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
                              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                            />
                            <button
                              onClick={handleReply}
                              disabled={sendingReply || !replyMessage.trim()}
                              className="px-4 py-2 rounded-xl bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
                            >
                              {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reply'}
                            </button>
                          </div>
                        )}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {['open', 'in_progress', 'resolved', 'closed'].map((status) => (
                            <button
                              key={status}
                              onClick={() => handleStatusChange(ticket._id, status)}
                              disabled={updatingStatus === ticket._id || selectedTicket.status === status}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                                selectedTicket.status === status
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                              } disabled:opacity-50`}
                            >
                              {updatingStatus === ticket._id ? '…' : status.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
