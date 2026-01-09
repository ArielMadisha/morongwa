'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  HelpCircle,
  MessageCircle,
  Search,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

function SupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    subject: '',
    category: 'general',
    description: '',
  });

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      // Mock tickets data
      setTickets([
        {
          _id: '1',
          subject: 'Issue with task payment',
          category: 'billing',
          status: 'open',
          priority: 'high',
          createdAt: new Date(Date.now() - 86400000),
          messages: [],
        },
        {
          _id: '2',
          subject: 'Account verification help',
          category: 'account',
          status: 'resolved',
          priority: 'medium',
          createdAt: new Date(Date.now() - 172800000),
          messages: [],
        },
        {
          _id: '3',
          subject: 'Feature request',
          category: 'general',
          status: 'pending',
          priority: 'low',
          createdAt: new Date(Date.now() - 259200000),
          messages: [],
        },
      ]);
    } catch (error) {
      toast.error('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTicket = (ticket: any) => {
    setSelectedTicket(ticket);
    setMessages([
      {
        _id: '1',
        sender: 'support',
        text: 'Thank you for contacting us. We are looking into your issue.',
        createdAt: new Date(Date.now() - 3600000),
      },
      {
        _id: '2',
        sender: user?._id,
        text: 'Thank you, I appreciate the help!',
        createdAt: new Date(Date.now() - 1800000),
      },
    ]);
  };

  const handleCreateTicket = async () => {
    if (!formData.subject.trim() || !formData.description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    setSending(true);
    try {
      const newTicket = {
        _id: Date.now().toString(),
        ...formData,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date(),
        messages: [],
      };
      setTickets([newTicket, ...tickets]);
      toast.success('Support ticket created');
      setFormData({ subject: '', category: 'general', description: '' });
      setShowCreateForm(false);
    } catch (error) {
      toast.error('Failed to create ticket');
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedTicket) return;

    setSending(true);
    try {
      setMessages([
        ...messages,
        {
          _id: Date.now().toString(),
          sender: user?._id,
          text: message,
          createdAt: new Date(),
        },
      ]);
      setMessage('');
      toast.success('Message sent');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const styles: any = {
      open: 'bg-red-100 text-red-700',
      pending: 'bg-yellow-100 text-yellow-700',
      resolved: 'bg-emerald-100 text-emerald-700',
    };
    return styles[status] || 'bg-slate-100 text-slate-700';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <AlertCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'resolved':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <HelpCircle className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Support</h1>
              <p className="mt-1 text-sm text-slate-600">Get help and manage your support tickets</p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="grid gap-6 lg:grid-cols-3 min-h-[600px]">
            <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search tickets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 pl-10 pr-4 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="w-full rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-4 w-4" />
                  New ticket
                </button>
              </div>

              {showCreateForm && (
                <div className="p-4 border-b border-slate-100 space-y-3">
                  <div>
                    <label className="block text-xs uppercase tracking-[0.1em] text-sky-600 font-semibold mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      placeholder="Brief subject..."
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.1em] text-sky-600 font-semibold mb-1">
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    >
                      <option value="general">General</option>
                      <option value="billing">Billing</option>
                      <option value="account">Account</option>
                      <option value="technical">Technical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-[0.1em] text-sky-600 font-semibold mb-1">
                      Description
                    </label>
                    <textarea
                      placeholder="Describe your issue..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      rows={3}
                    />
                  </div>
                  <button
                    onClick={handleCreateTicket}
                    disabled={sending}
                    className="w-full rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:scale-[1.01] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 p-2">
                {filteredTickets.length === 0 ? (
                  <div className="py-8 text-center text-slate-600">
                    <HelpCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm">No support tickets</p>
                  </div>
                ) : (
                  filteredTickets.map((ticket) => (
                    <button
                      key={ticket._id}
                      onClick={() => handleSelectTicket(ticket)}
                      className={`w-full text-left rounded-lg p-3 transition border ${
                        selectedTicket?._id === ticket._id
                          ? 'bg-sky-100 border-sky-200'
                          : 'hover:bg-slate-50 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate text-sm">
                            {ticket.subject}
                          </p>
                          <p className="text-xs text-slate-600 capitalize">{ticket.category}</p>
                        </div>
                        <div className={`flex-shrink-0 px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 ${getStatusBadge(ticket.status)}`}>
                          {getStatusIcon(ticket.status)}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              {selectedTicket ? (
                <>
                  <div className="border-b border-slate-100 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          {selectedTicket.subject}
                        </h2>
                        <p className="text-xs text-slate-600">
                          {selectedTicket.category.toUpperCase()} • {new Date(selectedTicket.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${getStatusBadge(selectedTicket.status)}`}>
                        {getStatusIcon(selectedTicket.status)}
                        {selectedTicket.status.charAt(0).toUpperCase() + selectedTicket.status.slice(1)}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="p-3 rounded-lg bg-sky-50 border border-sky-100">
                      <p className="text-sm text-slate-900 font-semibold mb-1">Your Issue</p>
                      <p className="text-sm text-slate-700">{selectedTicket.description || 'No description provided'}</p>
                    </div>

                    {messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`flex ${msg.sender === user?._id ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`rounded-lg px-4 py-2 max-w-xs ${
                            msg.sender === user?._id
                              ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          <p className="text-sm">{msg.text}</p>
                          <p className={`text-xs mt-1 ${msg.sender === user?._id ? 'text-white/70' : 'text-slate-600'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedTicket.status !== 'resolved' && (
                    <div className="border-t border-slate-100 p-4 flex gap-2">
                      <input
                        type="text"
                        placeholder="Type your reply..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="flex-1 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={sending || !message.trim()}
                        className="rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-white font-semibold transition hover:scale-[1.01] disabled:opacity-50 flex items-center gap-2"
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <HelpCircle className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                    <p className="text-slate-600">Select a ticket or create a new one to get started</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default SupportPage;
