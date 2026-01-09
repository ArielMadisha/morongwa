'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Send,
  Loader2,
  MessageCircle,
  Search,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';

function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      // Mock conversations data
      setConversations([
        {
          _id: '1',
          user: {
            _id: '2',
            firstName: 'John',
            lastName: 'Doe',
            role: 'runner',
          },
          lastMessage: 'Thanks for the task!',
          lastMessageTime: new Date(Date.now() - 3600000),
          unread: 2,
        },
        {
          _id: '2',
          user: {
            _id: '3',
            firstName: 'Jane',
            lastName: 'Smith',
            role: 'client',
          },
          lastMessage: 'When can you start?',
          lastMessageTime: new Date(Date.now() - 7200000),
          unread: 0,
        },
      ]);
    } catch (error) {
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectChat = (conversation: any) => {
    setSelectedChat(conversation);
    setMessages([
      {
        _id: '1',
        sender: conversation.user._id,
        text: conversation.lastMessage,
        createdAt: conversation.lastMessageTime,
      },
      {
        _id: '2',
        sender: user?._id,
        text: 'Sounds good!',
        createdAt: new Date(Date.now() - 1800000),
      },
    ]);
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    setSending(true);
    try {
      setMessages([
        ...messages,
        {
          _id: Date.now().toString(),
          sender: user?._id,
          text: newMessage,
          createdAt: new Date(),
        },
      ]);
      setNewMessage('');
      toast.success('Message sent');
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter((conv) =>
    `${conv.user.firstName} ${conv.user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">Messages</h1>
              <p className="mt-1 text-sm text-slate-600">Connect with clients and runners</p>
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
          <div className="grid gap-6 lg:grid-cols-3 h-[600px]">
            <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 pl-10 pr-4 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                <button className="w-full rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 flex items-center justify-center gap-2">
                  <Plus className="h-4 w-4" />
                  New chat
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 p-2">
                {filteredConversations.length === 0 ? (
                  <div className="py-8 text-center text-slate-600">
                    <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm">No conversations yet</p>
                  </div>
                ) : (
                  filteredConversations.map((conv) => (
                    <button
                      key={conv._id}
                      onClick={() => handleSelectChat(conv)}
                      className={`w-full text-left rounded-lg p-3 transition ${
                        selectedChat?._id === conv._id
                          ? 'bg-sky-100'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {conv.user.firstName} {conv.user.lastName}
                          </p>
                          <p className="text-xs text-slate-600 truncate">{conv.lastMessage}</p>
                        </div>
                        {conv.unread > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              {selectedChat ? (
                <>
                  <div className="border-b border-slate-100 p-4">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {selectedChat.user.firstName} {selectedChat.user.lastName}
                    </h2>
                    <p className="text-xs text-slate-600 capitalize">{selectedChat.user.role}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
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

                  <div className="border-t border-slate-100 p-4 flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="rounded-lg bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-white font-semibold transition hover:scale-[1.01] disabled:opacity-50 flex items-center gap-2"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageCircle className="mx-auto mb-4 h-16 w-16 text-slate-300" />
                    <p className="text-slate-600">Select a conversation to start chatting</p>
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

export default MessagesPage;
