'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Calendar, Copy, Hash, Link2, Loader2, Play, Video } from 'lucide-react';
import { morongwaAPI } from '@/lib/api';
import { useWebRTCCall } from '@/contexts/WebRTCCallContext';
import { useAuth } from '@/contexts/AuthContext';

type MeetTab = 'link' | 'schedule' | 'join' | 'now';

type Props = {
  initialJoinId?: string;
  onJoined?: () => void;
};

function normalizeMeetingIdInput(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (s.toLowerCase().startsWith('meeting-')) {
    return s.slice(8).toUpperCase();
  }
  return s.toUpperCase();
}

export function MorongwaMeetSection({ initialJoinId, onJoined }: Props) {
  const [tab, setTab] = useState<MeetTab>(initialJoinId ? 'join' : 'link');
  const [loading, setLoading] = useState(false);
  const [joinUrl, setJoinUrl] = useState('');
  const [meetingId, setMeetingId] = useState(initialJoinId || '');
  const [passcode, setPasscode] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('12:30');
  const { joinMeetingCall, callStatus } = useWebRTCCall();
  const { user } = useAuth();
  const uid = user?._id || user?.id ? String(user._id || user.id) : '';

  const joinAttemptedRef = useRef(false);

  useEffect(() => {
    if (!initialJoinId || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;
    setMeetingId(initialJoinId);
    setTab('join');
  }, [initialJoinId]);

  const enterMeeting = useCallback(
    async (id: string, code?: string) => {
      const meetingCode = normalizeMeetingIdInput(id);
      if (!meetingCode) {
        toast.error('Enter a meeting ID');
        return;
      }
      setLoading(true);
      try {
        const res = await morongwaAPI.joinMeeting({
          meetingId: meetingCode,
          passcode: code?.trim() || undefined,
        });
        const m = res.data.data;
        const hostId = String(m.hostUserId || '');
        const preferredPeer = hostId && hostId !== uid ? hostId : '';
        joinMeetingCall({
          roomId: m.roomId,
          meetingId: m.meetingId,
          peerUserId: preferredPeer,
          peerUserName: m.hostName,
          meetingMode: true,
          meetingTitle: m.title,
          audioOnly: false,
        });
        toast.success(`Joined ${m.title}`);
        onJoined?.();
      } catch (e: unknown) {
        const msg =
          e && typeof e === 'object' && 'response' in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined;
        toast.error(msg || 'Could not join meeting');
      } finally {
        setLoading(false);
      }
    },
    [joinMeetingCall, onJoined, uid]
  );

  useEffect(() => {
    if (!initialJoinId || callStatus !== 'idle') return;
    void enterMeeting(initialJoinId);
  }, [initialJoinId, callStatus, enterMeeting]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const createLink = async () => {
    setLoading(true);
    try {
      const res = await morongwaAPI.createInstantMeeting({ title: title.trim() || undefined, passcode: passcode.trim() || undefined });
      setJoinUrl(res.data.joinUrl);
      setMeetingId(res.data.data.meetingId);
      toast.success('Meeting link created');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to create meeting link');
    } finally {
      setLoading(false);
    }
  };

  const scheduleMeeting = async () => {
    if (!startDate) {
      toast.error('Pick a date');
      return;
    }
    setLoading(true);
    try {
      const scheduledStart = new Date(`${startDate}T${startTime}:00`);
      const scheduledEnd = new Date(`${startDate}T${endTime}:00`);
      const res = await morongwaAPI.scheduleMeeting({
        title: title.trim() || 'Scheduled meeting',
        passcode: passcode.trim() || undefined,
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      });
      setJoinUrl(res.data.joinUrl);
      setMeetingId(res.data.data.meetingId);
      toast.success('Meeting scheduled');
      setTab('link');
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Failed to schedule meeting');
    } finally {
      setLoading(false);
    }
  };

  const joinMeeting = () => void enterMeeting(meetingId, passcode);

  const startMeetingNow = async () => {
    setLoading(true);
    try {
      const meetingTitle = title.trim() || `${user?.name?.trim() || 'My'} meeting`;
      const res = await morongwaAPI.createInstantMeeting({
        title: meetingTitle,
        passcode: passcode.trim() || undefined,
      });
      const id = res.data.data.meetingId;
      setMeetingId(id);
      setJoinUrl(res.data.joinUrl);
      await enterMeeting(id, passcode);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Could not start meeting');
    } finally {
      setLoading(false);
    }
  };

  const tabBtnClass = (active: boolean) =>
    `inline-flex flex-1 min-w-[10rem] cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${
      active ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
    }`;

  return (
    <div className="flex w-full flex-1 flex-col overflow-y-auto bg-white p-4 sm:p-6 min-h-[min(70dvh,calc(100dvh-11rem))] lg:h-full lg:min-h-0">
      <h1 className="text-xl font-bold text-slate-900 mb-4">Meet</h1>
      <div className="mb-6 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <button type="button" onClick={() => setTab('link')} className={tabBtnClass(tab === 'link')}>
          <Link2 className="h-4 w-4 shrink-0" />
          Create a meeting link
        </button>
        <button type="button" onClick={() => setTab('schedule')} className={tabBtnClass(tab === 'schedule')}>
          <Calendar className="h-4 w-4 shrink-0 text-pink-500" />
          Schedule a meeting
        </button>
        <button type="button" onClick={() => setTab('join')} className={tabBtnClass(tab === 'join')}>
          <Hash className="h-4 w-4 shrink-0 text-sky-600" />
          Join with a meeting ID
        </button>
        <button type="button" onClick={() => setTab('now')} className={tabBtnClass(tab === 'now')}>
          <Play className="h-4 w-4 shrink-0 text-emerald-600" />
          Start a Meeting Now
        </button>
      </div>

      {tab === 'link' && (
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
          <Video className="h-8 w-8 text-violet-600 mb-3" />
          <p className="text-slate-700 mb-4">Quickly create, save, and share links with anyone.</p>
          <input
            type="text"
            placeholder="Meeting title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Passcode (optional)"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void createLink()}
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Create link'}
          </button>
          {joinUrl ? (
            <div className="mt-4 rounded-lg border border-violet-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">Meeting ID: {meetingId}</p>
              <p className="text-sm break-all text-violet-700">{joinUrl}</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void copyText(joinUrl)}
                  className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 hover:underline"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </button>
                <button
                  type="button"
                  onClick={() => void enterMeeting(meetingId, passcode)}
                  disabled={loading || callStatus !== 'idle'}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  <Video className="h-3.5 w-3.5" /> Start meeting
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
          <p className="text-sm text-slate-600">Time zone: (UTC+02:00) Harare, Pretoria</p>
          <input
            type="text"
            placeholder="Add title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap gap-3">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <span className="self-center text-slate-400">→</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <input
            type="text"
            placeholder="Passcode (optional)"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <textarea placeholder="Type details for this new meeting" rows={4} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button
            type="button"
            onClick={() => void scheduleMeeting()}
            disabled={loading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      )}

      {tab === 'join' && (
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Join a meeting with an ID</h2>
          <label className="block text-sm font-medium text-slate-700 mb-1">Meeting ID</label>
          <input
            type="text"
            placeholder="Type a meeting ID"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          />
          <label className="block text-sm font-medium text-slate-700 mb-1">Type a meeting passcode</label>
          <input
            type="text"
            placeholder="Type a meeting passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={joinMeeting}
            disabled={loading || !meetingId.trim() || callStatus !== 'idle'}
            className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Join meeting'}
          </button>
        </div>
      )}

      {tab === 'now' && (
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-6">
          <Video className="h-8 w-8 text-violet-600 mb-3" />
          <p className="text-slate-700 mb-4">
            Start an instant video meeting. You will enter the call right away and can share the join link with others.
          </p>
          <input
            type="text"
            placeholder="Meeting title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-3 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Passcode (optional)"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="mb-4 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void startMeetingNow()}
            disabled={loading || callStatus !== 'idle'}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start meeting now
          </button>
        </div>
      )}
    </div>
  );
}
