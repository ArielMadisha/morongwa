'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { Send, Loader2, MessageCircle, Plus, X, Video, Phone, Search } from 'lucide-react';
import { SearchButton } from '@/components/SearchButton';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { useWebRTCCall } from '@/contexts/WebRTCCallContext';
import { messengerAPI, productEnquiryAPI, usersAPI } from '@/lib/api';
import { userPublicDisplayName } from '@/lib/userDisplayLabel';
import { useMessengerUnread } from '@/contexts/MessengerUnreadContext';
import { directCallRoomId } from '@/lib/callRoom';
import { MorongwaMessengerToolbar } from '@/components/morongwa/MorongwaMessengerToolbar';
import { MorongwaGroupChatModal, type GroupChatParticipant } from '@/components/morongwa/MorongwaGroupChatModal';
import { MorongwaPstnCallFab } from '@/components/morongwa/MorongwaPstnCallFab';
import { MorongwaCallHistoryList } from '@/components/morongwa/MorongwaCallHistoryList';
import { MorongwaRail } from '@/components/morongwa/MorongwaRail';
import { MorongwaMeetSection } from '@/components/morongwa/MorongwaMeetSection';
import { MorongwaPeopleSection } from '@/components/morongwa/MorongwaPeopleSection';
import { MorongwaFilesSection } from '@/components/morongwa/MorongwaFilesSection';
import { MorongwaCalendarSection } from '@/components/morongwa/MorongwaCalendarSection';
import { MorongwaActivitySection } from '@/components/morongwa/MorongwaActivitySection';
import { MorongwaCallSection } from '@/components/morongwa/MorongwaCallSection';
import { MorongwaSupportSection } from '@/components/morongwa/MorongwaSupportSection';
import { MorongwaPageLayout } from '@/components/morongwa/MorongwaPageLayout';
import type { MorongwaSection } from '@/lib/api';
import { notificationsAPI } from '@/lib/api';

function MessagesPageContent() {
  const { user, logout } = useAuth();
  const { refreshUnread, unreadCount: messengerUnread } = useMessengerUnread();
  const router = useRouter();
  const searchParams = useSearchParams();
  const withUserHandledRef = useRef(false);
  const { startOutgoingCall, acceptIncomingCall } = useWebRTCCall();
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
  const [groupChatOpen, setGroupChatOpen] = useState(false);
  const [leftPanelMode, setLeftPanelMode] = useState<'chats' | 'calls'>('chats');
  const [callHistoryRefresh, setCallHistoryRefresh] = useState(0);
  const [pstnDialTo, setPstnDialTo] = useState('');
  const [pstnFabOpen, setPstnFabOpen] = useState(false);
  const [activityUnread, setActivityUnread] = useState(0);
  const [chatListFilter, setChatListFilter] = useState<'chats' | 'unread'>('chats');

  const sectionParam = searchParams.get('section');
  const morongwaSection: MorongwaSection =
    sectionParam === 'meet' ||
    sectionParam === 'people' ||
    sectionParam === 'files' ||
    sectionParam === 'calendar' ||
    sectionParam === 'activity' ||
    sectionParam === 'call' ||
    sectionParam === 'support'
      ? sectionParam
      : 'chat';
  const meetJoinId = searchParams.get('join') || '';

  const setMorongwaSection = (next: MorongwaSection) => {
    const q = new URLSearchParams();
    if (next !== 'chat') q.set('section', next);
    const qs = q.toString();
    router.replace(qs ? `/messages?${qs}` : '/messages');
  };

  const roomId =
    activeTab === 'tasks'
      ? selectedChat?.taskId ||
        (selectedChat?.kind === 'direct' && selectedChat?.user?._id && user?._id
          ? directCallRoomId(String(user._id), String(selectedChat.user._id))
          : '')
      : '';
  const peerUserId = activeTab === 'tasks' && selectedChat?.user?._id ? String(selectedChat.user._id) : '';
  const peerUserName = activeTab === 'tasks' && selectedChat?.user?.name ? selectedChat.user.name : undefined;

  /** Legacy deep link: /messages?acceptCall=1&callerId=… (global modal now accepts in place). */
  useEffect(() => {
    if (searchParams.get('acceptCall') !== '1') return;
    const callerId = searchParams.get('callerId') || '';
    const callRoomId = searchParams.get('roomId') || '';
    const callerName = searchParams.get('callerName') || undefined;
    const audioOnly = searchParams.get('audioOnly') === '1';
    const uid = user?._id || user?.id;
    if (!callerId || !callRoomId || !uid) return;

    const conv = conversations.find((c) => String(c.user?._id) === callerId);
    if (conv) setSelectedChat(conv);

    acceptIncomingCall({ callerId, roomId: callRoomId, callerName, audioOnly });
    router.replace('/messages');
  }, [searchParams, user?._id, user?.id, conversations, acceptIncomingCall, router]);

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
    notificationsAPI.getUnreadCount().then((res) => {
      const n = Number(res.data?.unreadCount ?? 0);
      setActivityUnread(Number.isFinite(n) ? n : 0);
    }).catch(() => setActivityUnread(0));
  }, [morongwaSection]);

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
      void refreshUnread();
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

  /** Open direct chat from profile hover card: /messages?with={userId} */
  useEffect(() => {
    const withId = (searchParams.get('with') || '').trim();
    if (!withId) {
      withUserHandledRef.current = false;
      return;
    }
    if (!user || loading || withUserHandledRef.current) return;
    withUserHandledRef.current = true;

    const existing = conversations.find(
      (c) =>
        (c.kind === 'direct' || !c.taskId) &&
        String(c.user?._id || c.otherUserId || '') === withId
    );
    if (existing) {
      void handleSelectChat(existing);
      router.replace('/messages');
      return;
    }

    void (async () => {
      let chatUser: { _id: string; name?: string; username?: string } = { _id: withId, name: 'User' };
      try {
        const res = await usersAPI.getProfileStats(withId);
        const u = res.data?.user;
        if (u) {
          chatUser = {
            _id: withId,
            name: userPublicDisplayName(u),
            username: typeof u.username === 'string' ? u.username : undefined,
          };
        }
      } catch {
        /* use fallback name */
      }
      startDirectChat(chatUser);
      router.replace('/messages');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per ?with= navigation
  }, [searchParams, user, loading, conversations]);

  const filteredConversations = conversations.filter((conv) => {
    const matchesSearch = `${conv.user?.name ?? ''} ${conv.taskTitle ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (chatListFilter === 'unread') return Number(conv.unread || 0) > 0;
    return true;
  });

  const handleToolbarVideoCall = () => {
    if (peerUserId && roomId) {
      startOutgoingCall({
        roomId,
        peerUserId,
        peerUserName,
        audioOnly: false,
      });
      return;
    }
    router.push('/calls?mode=video');
  };

  const handleToolbarAudioCall = () => {
    if (peerUserId && roomId) {
      startOutgoingCall({
        roomId,
        peerUserId,
        peerUserName,
        audioOnly: true,
      });
      return;
    }
    router.push('/calls?mode=voice');
  };

  const handleGroupChatCreate = (participants: GroupChatParticipant[]) => {
    try {
      sessionStorage.setItem('morongwa.groupParticipants', JSON.stringify(participants));
    } catch {
      /* ignore */
    }
    setGroupChatOpen(false);
    router.push('/calls?meeting=1');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <>
            <Image src="/messages-icon.png" alt="" width={24} height={24} className="h-6 w-6 object-contain shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold text-slate-900 min-w-0 break-words sm:truncate">Morongwa</h1>
          </>
        }
        actions={
          <>
            <SearchButton />
            <ProfileHeaderButton />
          </>
        }
      />
      <div className="flex min-h-0 min-w-0 w-full flex-1">
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
        <div className="flex flex-1 min-h-0 overflow-hidden min-w-0 pt-2 sm:pt-4">
          <MorongwaRail
            active={morongwaSection}
            onChange={setMorongwaSection}
            chatUnread={messengerUnread}
            activityUnread={activityUnread}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <MorongwaPageLayout>
          {morongwaSection === 'meet' ? (
            <MorongwaMeetSection initialJoinId={meetJoinId || undefined} />
          ) : morongwaSection === 'people' ? (
            <MorongwaPeopleSection
              onCallPhone={(e164) => {
                setPstnDialTo(e164);
                setMorongwaSection('call');
              }}
              onMessageUser={(userId) => {
                setMorongwaSection('chat');
                router.replace(`/messages?with=${encodeURIComponent(userId)}`);
              }}
            />
          ) : morongwaSection === 'files' ? (
            <MorongwaFilesSection />
          ) : morongwaSection === 'calendar' ? (
            <MorongwaCalendarSection onNewMeeting={() => setMorongwaSection('meet')} />
          ) : morongwaSection === 'activity' ? (
            <MorongwaActivitySection />
          ) : morongwaSection === 'call' ? (
            <MorongwaCallSection
              initialTo={pstnDialTo}
              onCallEnded={() => setCallHistoryRefresh((n) => n + 1)}
            />
          ) : morongwaSection === 'support' ? (
            <MorongwaSupportSection />
          ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0 overflow-hidden min-w-0 order-2 lg:order-none w-full">
          <main className="flex-1 min-w-0 overflow-auto pb-24 md:pb-0 order-2 lg:order-none w-full">
          {loading ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
          ) : (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-3 h-[600px]">
            <div className="rounded-2xl border border-white/60 bg-white/80 shadow-xl shadow-sky-50 backdrop-blur overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setChatListFilter('chats')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      chatListFilter === 'chats' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Chats
                  </button>
                  <button
                    type="button"
                    onClick={openNewChat}
                    className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-violet-700 hover:shadow-sm"
                  >
                    New Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatListFilter('unread')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      chatListFilter === 'unread' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unread
                  </button>
                </div>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setLeftPanelMode('chats')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      leftPanelMode === 'chats' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Messages
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftPanelMode('calls')}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                      leftPanelMode === 'calls' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Call history
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={
                      leftPanelMode === 'calls'
                        ? 'Search calls…'
                        : activeTab === 'tasks'
                          ? 'Search conversations...'
                          : 'Search enquiries...'
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white/80 pl-10 pr-4 py-2 text-sm text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-2 p-2">
                {leftPanelMode === 'calls' ? (
                  <MorongwaCallHistoryList
                    searchQuery={searchQuery}
                    refreshKey={callHistoryRefresh}
                    onRedial={(e164) => {
                      setPstnDialTo(e164);
                      setPstnFabOpen(true);
                    }}
                  />
                ) : activeTab === 'tasks' ? (
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
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 break-words">{conv.user?.name ?? 'Unknown'}</p>
                          <p className="text-xs text-slate-600 break-words whitespace-normal leading-snug">
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
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 break-words">{(enq.productId as any)?.title ?? 'Product'}</p>
                          <p className="text-xs text-slate-600 break-words whitespace-normal leading-snug">
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
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 shrink-0 bg-white/90">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('tasks');
                      setSelectedEnquiry(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      activeTab === 'tasks'
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('enquiries');
                      setSelectedChat(null);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      activeTab === 'enquiries'
                        ? 'bg-sky-500 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Product enquiries
                  </button>
                  <button
                    type="button"
                    onClick={openNewChat}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-sky-600 transition hover:bg-sky-50"
                  >
                    <Plus className="h-4 w-4" />
                    New chat
                  </button>
                </div>
                <MorongwaMessengerToolbar
                  onVideoCall={handleToolbarVideoCall}
                  onAudioCall={handleToolbarAudioCall}
                  onStartGroupChat={() => setGroupChatOpen(true)}
                />
              </div>
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
                            className={`rounded-lg px-4 py-2 max-w-[85%] sm:max-w-md break-words ${
                              String(msg.senderId?._id ?? msg.senderId) === String(user?._id)
                                ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white'
                                : 'bg-slate-100 text-slate-900'
                            }`}
                          >
                            <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          startOutgoingCall({
                            roomId,
                            peerUserId,
                            peerUserName,
                            audioOnly: true,
                          })
                        }
                        disabled={!roomId || !peerUserId}
                        className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Start voice call"
                      >
                        <Phone className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() =>
                          startOutgoingCall({
                            roomId,
                            peerUserId,
                            peerUserName,
                            audioOnly: false,
                          })
                        }
                        disabled={!roomId || !peerUserId}
                        className="p-2.5 rounded-xl bg-sky-100 text-sky-600 hover:bg-sky-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Start video call"
                      >
                        <Video className="h-5 w-5" />
                      </button>
                    </div>
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
                          className={`rounded-lg px-4 py-2 max-w-[85%] sm:max-w-md break-words ${
                            msg.sender === user?._id || String(msg.sender) === String(user?._id)
                              ? 'bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>
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
        </div>
          )}
          </MorongwaPageLayout>
          </div>
        </div>
        </div>
      </div>
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
      {morongwaSection === 'chat' ? (
      <MorongwaPstnCallFab
        open={pstnFabOpen}
        onOpenChange={setPstnFabOpen}
        initialTo={pstnDialTo}
        onCallEnded={() => setCallHistoryRefresh((n) => n + 1)}
      />
      ) : null}

      <MorongwaGroupChatModal
        open={groupChatOpen}
        onClose={() => setGroupChatOpen(false)}
        onCreate={handleGroupChatCreate}
        currentUserId={String(user?._id || user?.id || '')}
      />

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
                        <p className="font-semibold text-slate-900 break-words">{u.name || u.username || 'User'}</p>
                        <p className="text-xs text-slate-600 break-words">@{u.username || 'user'}</p>
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
                        <p className="font-semibold text-slate-900 break-words">{conv.user?.name ?? 'Unknown'}</p>
                        <p className="text-xs text-slate-600 break-words whitespace-normal leading-snug">
                          {conv.kind === 'direct' ? 'Direct message' : conv.taskTitle}
                        </p>
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
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        }
      >
        <MessagesPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
