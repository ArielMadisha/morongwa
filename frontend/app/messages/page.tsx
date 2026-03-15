'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { Send, Loader2, MessageCircle, Plus, X, Video, Search } from 'lucide-react';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { VideoCallView } from '@/components/VideoCallView';
import { useWebRTC } from '@/hooks/useWebRTC';
import { messengerAPI, productEnquiryAPI } from '@/lib/api';

function MessagesPageContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const handleLogout = () => {
    logout();
    router.push('/');
  };
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [discoverUsers, setDiscoverUsers] = useState<any[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'enquiries'>('tasks');
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);
  const [selectedEnquiry, setSelectedEnquiry] = useState<any>(null);
  const [enquiryMessages, setEnquiryMessages] = useState<any[]>([]);
  const [enquiryMessagesLoading, setEnquiryMessagesLoading] = useState(false);
  const [enquirySending, setEnquirySending] = useState(false);
  const [enquiryNewMessage, setEnquiryNewMessage] = useState('');

  const roomId = activeTab === 'tasks'
    ? (selectedChat?.taskId || (selectedChat?.kind === 'direct' && selectedChat?.user?._id ? `direct-${selectedChat.user._id}` : ''))
    : '';
  const peerUserId = activeTab === 'tasks' && selectedChat?.user?._id ? String(selectedChat.user._id) : '';
  const peerUserName = activeTab === 'tasks' && selectedChat?.user?.name ? selectedChat.user.name : undefined;

  const webrtc = useWebRTC({
    roomId,
    userId: user?._id || user?.id || '',
    userName: user?.name,
    peerUserId,
    peerUserName,
    onCallEnded: () => {},
  });

  useEffect(() => {
    if (roomId && user?._id && webrtc.callStatus === 'idle') {
      webrtc.joinRoomForIncoming();
      return () => webrtc.leaveRoomForIncoming();
    }
  }, [roomId, user?._id, webrtc.callStatus, webrtc.joinRoomForIncoming, webrtc.leaveRoomForIncoming]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const res = await messengerAPI.getConversations();
      const list = res.data?.conversations ?? [];
      setConversations(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error('Failed to load conversations');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEnquiries = async () => {
    try {
      setEnquiriesLoading(true);
      const res = await productEnquiryAPI.getMyEnquiries();
      const list = res.data?.data ?? res.data ?? [];
      setEnquiries(Array.isArray(list) ? list : []);
    } catch {
      setEnquiries([]);
    } finally {
      setEnquiriesLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (!newChatOpen) return;
    setDiscoverLoading(true);
    messengerAPI.searchUsers(newChatSearch || undefined, 20)
      .then((res) => {
        const list = res.data?.data ?? [];
        setDiscoverUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => setDiscoverUsers([]))
      .finally(() => setDiscoverLoading(false));
  }, [newChatOpen, newChatSearch]);

  useEffect(() => {
    if (activeTab === 'enquiries') fetchEnquiries();
  }, [activeTab]);

  const handleSelectEnquiry = async (enquiry: any) => {
    setSelectedChat(null);
    setSelectedEnquiry(enquiry);
    setEnquiryMessagesLoading(true);
    setEnquiryMessages([]);
    try {
      const res = await productEnquiryAPI.getMessages(enquiry._id);
      const list = res.data?.data ?? res.data ?? [];
      setEnquiryMessages(Array.isArray(list) ? list : []);
    } catch {
      setEnquiryMessages([]);
    } finally {
      setEnquiryMessagesLoading(false);
    }
  };

  const handleSendEnquiryMessage = async () => {
    if (!enquiryNewMessage.trim() || !selectedEnquiry) return;
    setEnquirySending(true);
    const text = enquiryNewMessage.trim();
    setEnquiryNewMessage('');
    try {
      await productEnquiryAPI.sendMessage(selectedEnquiry._id, text);
      setEnquiryMessages((prev) => [
        ...prev,
        {
          _id: Date.now().toString(),
          senderId: user?._id,
          content: text,
          createdAt: new Date(),
        },
      ]);
      setEnquiries((prev) =>
        prev.map((e) =>
          e._id === selectedEnquiry._id ? { ...e, lastMessageAt: new Date() } : e
        )
      );
      toast.success('Message sent');
    } catch (e: any) {
      setEnquiryNewMessage(text);
      toast.error(e.response?.data?.message || 'Failed to send');
    } finally {
      setEnquirySending(false);
    }
  };

  const handleSelectChat = async (conversation: any) => {
    setSelectedEnquiry(null);
    setSelectedChat(conversation);
    setMessagesLoading(true);
    setMessages([]);
    try {
      const isDirect = conversation?.kind === 'direct' || !conversation?.taskId;
      const res = isDirect
        ? await messengerAPI.getDirectMessages(conversation.user?._id || conversation.otherUserId)
        : await messengerAPI.getMessages(conversation.taskId);
      const list = res.data?.messages ?? [];
      const msgs = (Array.isArray(list) ? list : []).map((m: any) => ({
        _id: m._id,
        sender: m.sender?._id ?? m.sender,
        text: m.content ?? m.text,
        createdAt: m.createdAt,
      }));
      setMessages(msgs);
      if (!isDirect) messengerAPI.markAsRead(conversation.taskId).catch(() => {});
    } catch (error) {
      toast.error('Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    setSending(true);
    const text = newMessage.trim();
    setNewMessage('');
    try {
      const isDirect = selectedChat?.kind === 'direct' || !selectedChat?.taskId;
      const res = isDirect
        ? await messengerAPI.sendDirectMessage(selectedChat.user?._id || selectedChat.otherUserId, text)
        : await messengerAPI.sendMessage(selectedChat.taskId, text);
      const m = res.data?.data;
      if (m) {
        setMessages((prev) => [
          ...prev,
          {
            _id: m._id,
            sender: m.sender?._id ?? m.sender ?? user?._id,
            text: m.content ?? text,
            createdAt: m.createdAt ?? new Date(),
          },
        ]);
        setConversations((prev) =>
          prev.map((c) =>
            c._id === selectedChat._id
              ? { ...c, lastMessage: text, lastMessageTime: new Date(), unread: 0 }
              : c
          )
        );
        toast.success('Message sent');
      } else {
        setMessages((prev) => [...prev, { _id: Date.now().toString(), sender: user?._id, text, createdAt: new Date() }]);
        setConversations((prev) =>
          prev.map((c) =>
            c._id === selectedChat._id ? { ...c, lastMessage: text, lastMessageTime: new Date() } : c
          )
        );
        toast.success('Message sent');
      }
    } catch (error: any) {
      setNewMessage(text);
      toast.error(error.response?.data?.message ?? 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const openNewChat = () => {
    setNewChatSearch('');
    setNewChatOpen(true);
  };

  const startDirectChat = (u: any) => {
    const conv = {
      _id: `direct-${u._id}`,
      kind: 'direct',
      taskId: null,
      taskTitle: 'Direct message',
      user: { _id: u._id, name: u.name || u.username || 'User', role: Array.isArray(u.role) ? u.role.join(', ') : u.role || 'user' },
      unread: 0,
      lastMessage: '',
      lastMessageTime: new Date().toISOString(),
      otherUserId: u._id,
    };
    setConversations((prev) => {
      const exists = prev.find((c) => c._id === conv._id);
      if (exists) return prev;
      return [conv, ...prev];
    });
    setNewChatOpen(false);
    void handleSelectChat(conv);
  };

  const filteredConversations = conversations.filter((conv) =>
    `${conv.user?.name ?? ''} ${conv.taskTitle ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="px-3 sm:px-6 lg:px-8 py-1">
          <div className="flex items-center gap-2 sm:gap-3 w-full">
            <Link href="/wall" className="shrink-0 flex items-center" aria-label="Home">
              <img src="/qwertymates-logo-icon.png" alt="Qwertymates" className="h-8 w-8 object-contain lg:hidden" />
              <img src="/qwertymates-logo.png" alt="Qwertymates" className="h-7 w-auto object-contain hidden lg:block" />
            </Link>
            <AppSidebarMenuButton onClick={() => setMenuOpen((v) => !v)} />
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <Image src="/messages-icon.png" alt="" width={20} height={20} className="h-5 w-5 object-contain shrink-0" />
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">Morongwa</h1>
            </div>
            <div className="flex-1 min-w-0" />
            <div className="shrink-0 flex items-center gap-2">
              <SearchButton />
              <ProfileHeaderButton />
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <AppSidebar
          variant="wall"
          userName={user?.name}
          userAvatar={(user as any)?.avatar}
          userId={user?._id || user?.id}
          cartCount={cartCount}
          hasStore={hasStore}
          onLogout={handleLogout}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          hideLogo
          belowHeader
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-visible">
        <div className="flex-1 flex gap-0 pt-6 min-h-0 overflow-hidden">
          <main className="flex-1 min-w-0 overflow-auto pb-24 lg:pb-0">
          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3 h-[600px]">
            <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100">
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => { setActiveTab('tasks'); setSelectedEnquiry(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'tasks' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Tasks
                  </button>
                  <button
                    onClick={() => { setActiveTab('enquiries'); setSelectedChat(null); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium ${activeTab === 'enquiries' ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700'}`}
                  >
                    Product enquiries
                  </button>
                </div>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={activeTab === 'tasks' ? 'Search conversations...' : 'Search enquiries...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 pl-10 pr-4 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
                {activeTab === 'tasks' && (
                  <button
                    onClick={openNewChat}
                    className="w-full rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 flex items-center justify-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    New chat
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 p-2">
                {activeTab === 'tasks' ? (
                  filteredConversations.length === 0 ? (
                  <div className="py-8 text-center text-slate-600">
                    <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm">No conversations yet</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Need help? <Link href="/support?category=general:messages" className="text-sky-600 hover:underline">Contact support</Link>
                    </p>
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
                          <p className="font-semibold text-slate-900">{conv.user?.name ?? 'Unknown'}</p>
                          <p className="text-xs text-slate-600 truncate">
                            {conv.lastMessage || conv.taskTitle || 'No messages yet'}
                          </p>
                        </div>
                        {conv.unread > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </button>
                  ))
                )
                ) : enquiriesLoading ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                  </div>
                ) : enquiries.filter((e) =>
                  `${(e.productId as any)?.title ?? ''} ${(e.buyerId as any)?.name ?? ''} ${(e.sellerId as any)?.name ?? ''}`
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())
                ).length === 0 ? (
                  <div className="py-8 text-center text-slate-600">
                    <MessageCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm">No product enquiries yet</p>
                    <p className="text-xs mt-1">Enquire about products on QwertyTV or the marketplace</p>
                  </div>
                ) : (
                  enquiries
                    .filter((e) =>
                      `${(e.productId as any)?.title ?? ''} ${(e.buyerId as any)?.name ?? ''} ${(e.sellerId as any)?.name ?? ''}`
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                    )
                    .map((enq) => (
                      <button
                        key={enq._id}
                        onClick={() => handleSelectEnquiry(enq)}
                        className={`w-full text-left rounded-lg p-3 transition ${
                          selectedEnquiry?._id === enq._id ? 'bg-sky-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{(enq.productId as any)?.title ?? 'Product'}</p>
                          <p className="text-xs text-slate-600">
                            {enq.buyerId?._id === user?._id || String(enq.buyerId?._id) === String(user?._id)
                              ? `You → ${(enq.sellerId as any)?.name ?? 'Seller'}`
                              : `${(enq.buyerId as any)?.name ?? 'Buyer'} → You`}
                          </p>
                        </div>
                      </button>
                    ))
                )}
              </div>
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              {activeTab === 'enquiries' && selectedEnquiry ? (
                <>
                  <div className="border-b border-slate-100 p-4">
                    <h2 className="text-lg font-semibold text-slate-900">{(selectedEnquiry.productId as any)?.title ?? 'Product enquiry'}</h2>
                    <p className="text-xs text-slate-600">
                      {selectedEnquiry.buyerId?._id === user?._id || String(selectedEnquiry.buyerId?._id) === String(user?._id)
                        ? `Chat with seller ${(selectedEnquiry.sellerId as any)?.name}`
                        : `Chat with buyer ${(selectedEnquiry.buyerId as any)?.name}`}
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {enquiryMessagesLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                      </div>
                    ) : (
                      enquiryMessages.map((msg) => (
                        <div
                          key={msg._id}
                          className={`flex ${String(msg.senderId?._id ?? msg.senderId) === String(user?._id) ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`rounded-lg px-4 py-2 max-w-xs ${
                              String(msg.senderId?._id ?? msg.senderId) === String(user?._id)
                                ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white'
                                : 'bg-slate-100 text-slate-900'
                            }`}
                          >
                            <p className="text-sm">{msg.content}</p>
                            <p className={`text-xs mt-1 ${String(msg.senderId?._id ?? msg.senderId) === String(user?._id) ? 'text-white/70' : 'text-slate-600'}`}>
                              {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="border-t border-slate-100 p-4 flex gap-2">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={enquiryNewMessage}
                      onChange={(e) => setEnquiryNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendEnquiryMessage()}
                      className="flex-1 rounded-lg border border-slate-200 bg-white/80 px-4 py-2 text-sm text-slate-900"
                    />
                    <button
                      onClick={handleSendEnquiryMessage}
                      disabled={enquirySending || !enquiryNewMessage.trim()}
                      className="rounded-lg bg-sky-500 px-4 py-2 text-white font-semibold disabled:opacity-50 flex items-center gap-2"
                    >
                      {enquirySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </>
              ) : activeTab === 'tasks' && selectedChat ? (
                <>
                  <div className="border-b border-slate-100 p-4 flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{selectedChat.user?.name ?? 'Unknown'}</h2>
                      <p className="text-xs text-slate-600 capitalize">{selectedChat.user?.role ?? '—'}</p>
                    </div>
                    <button
                      onClick={() => webrtc.startCall()}
                      disabled={!roomId || !peerUserId}
                      className="p-2.5 rounded-xl bg-sky-100 text-sky-600 hover:bg-sky-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Start video call"
                    >
                      <Video className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messagesLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
                      </div>
                    ) : (
                    messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`flex ${msg.sender === user?._id || String(msg.sender) === String(user?._id) ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`rounded-lg px-4 py-2 max-w-xs ${
                            msg.sender === user?._id || String(msg.sender) === String(user?._id)
                              ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          <p className="text-sm">{msg.text}</p>
                          <p className={`text-xs mt-1 ${msg.sender === user?._id || String(msg.sender) === String(user?._id) ? 'text-white/70' : 'text-slate-600'}`}>
                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                    )}
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
                    <p className="text-slate-600">
                      {activeTab === 'enquiries' ? 'Select a product enquiry' : 'Select a conversation or click + New chat'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
          )}
          </main>
          <AdvertSlot belowHeader />
        </div>
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />

      {/* Video call overlay */}
      {webrtc.callStatus !== 'idle' && (
        <VideoCallView
          callStatus={webrtc.callStatus}
          localVideoRef={webrtc.localVideoRef}
          remoteVideoRef={webrtc.remoteVideoRef}
          localStream={webrtc.localStream}
          remoteStream={webrtc.remoteStream}
          peerName={peerUserName}
          incomingCaller={webrtc.incomingCaller}
          isMuted={webrtc.isMuted}
          isVideoOff={webrtc.isVideoOff}
          onStartCall={webrtc.startCall}
          onAcceptCall={webrtc.acceptCall}
          onRejectCall={webrtc.rejectCall}
          onCancelCall={webrtc.cancelCall}
          onEndCall={webrtc.endCall}
          onToggleMute={webrtc.toggleMute}
          onToggleVideo={webrtc.toggleVideo}
        />
      )}

      {/* New Chat modal */}
      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNewChatOpen(false)} aria-hidden="true" />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h3 className="text-lg font-semibold text-slate-900">New chat</h3>
              <button
                onClick={() => setNewChatOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4">
              <div className="mb-3">
                <input
                  type="text"
                  value={newChatSearch}
                  onChange={(e) => setNewChatSearch(e.target.value)}
                  placeholder="Search users by name, username or email..."
                  className="w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="space-y-3">
                {discoverLoading ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                  </div>
                ) : discoverUsers.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start direct chat</p>
                    {discoverUsers.map((u) => (
                      <button
                        key={u._id}
                        onClick={() => startDirectChat(u)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sky-200 hover:bg-sky-50/50"
                      >
                        <p className="font-semibold text-slate-900">{u.name || u.username || 'User'}</p>
                        <p className="text-xs text-slate-600 truncate">@{u.username || 'user'}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-500 text-sm">No users found</div>
                )}

                {conversations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Existing conversations</p>
                    {conversations.map((conv) => (
                      <button
                        key={conv._id}
                        onClick={() => {
                          handleSelectChat(conv);
                          setNewChatOpen(false);
                        }}
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-sky-200 hover:bg-sky-50/50"
                      >
                        <p className="font-semibold text-slate-900">{conv.user?.name ?? 'Unknown'}</p>
                        <p className="text-xs text-slate-600 truncate">{conv.kind === 'direct' ? 'Direct message' : conv.taskTitle}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <ProtectedRoute>
      <MessagesPageContent />
    </ProtectedRoute>
  );
}
