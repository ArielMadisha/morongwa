'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle,
  Loader2,
  Send,
  MessageSquare,
  AlertCircle,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import LiveTrackingMap from '@/components/LiveTrackingMap';
import { tasksAPI } from '@/lib/api';

// Helper function to safely format dates
const formatDate = (dateValue: any): string => {
  if (!dateValue) return 'Not set';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'Invalid Date';
  }
};

function TaskDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [escrow, setEscrow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completion, setCompletion] = useState('');
  const [runnerLocation, setRunnerLocation] = useState<{ lat: string; lon: string } | null>(null);
  const [commissionRate, setCommissionRate] = useState<number>(0.15); // Default fallback

  const hasRole = (r: any, v: string) => Array.isArray(r) ? r.includes(v) : r === v;

  useEffect(() => {
    if (id) fetchTask();
  }, [id]);

  useEffect(() => {
    const loadEscrow = async () => {
      if (!id) return;
      try {
        const { data } = await tasksAPI.getEscrow(id as string);
        setEscrow(data.escrow);
        if (data.commissionRate !== undefined) {
          setCommissionRate(data.commissionRate);
        }
      } catch (e) {
        setEscrow(null);
      }
    };
    loadEscrow();
  }, [id]);

  // live runner location subscription
  useEffect(() => {
    if (!task?.runner?._id || !task?._id) return;
    const base = process.env.NEXT_PUBLIC_SOCKET_URL || '';
    const ns = (base.endsWith('/') ? base.slice(0, -1) : base) + '/locations';
    const socket = io(ns, { autoConnect: true });
    socket.on('connect', () => {
      socket.emit('join', task._id);
    });
    socket.on('runner_location', (payload: any) => {
      try {
        if (!payload) return;
        if (payload.taskId && payload.taskId !== task._id) return;
        setRunnerLocation({ lat: String(payload.lat), lon: String(payload.lon) });
      } catch (e) {
        // ignore
      }
    });
    return () => {
      try { socket.disconnect(); } catch (e) {}
    };
  }, [task?.runner?._id, task?._id]);

  const fetchTask = async () => {
    try {
      const response = await tasksAPI.getById(id as string);
      setTask(response.data.task || response.data);
      if (response.data.commissionRate !== undefined) {
        setCommissionRate(response.data.commissionRate);
      }
    } catch (error) {
      toast.error('Failed to load task');
      router.push(hasRole(user?.role, 'runner') ? '/dashboard/runner' : '/dashboard/client');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async () => {
    if (!completion.trim()) {
      toast.error('Please provide completion details');
      return;
    }

    setSubmitting(true);
    try {
      await tasksAPI.complete(id as string);
      toast.success('Task submitted for review');
      setCompletion('');
      fetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to submit task');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center px-6 py-20">
          <AlertCircle className="mb-4 h-16 w-16 text-sky-400" />
          <h2 className="text-2xl font-bold text-slate-900">Task not found</h2>
          <Link
            href={hasRole(user?.role, 'runner') ? '/dashboard/runner' : '/dashboard/client'}
            className="mt-4 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-6 py-2 font-semibold text-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isRunner = hasRole(user?.role, 'runner');
  const isClient = hasRole(user?.role, 'client');
  const isAccepted = task.status === 'accepted';
  const isCompleted = task.status === 'completed';
  const isPending = task.status === 'pending';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
        <header className="border-b border-white/60 bg-white/70 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">{task.title}</h1>
              <p className="mt-1 text-sm text-slate-600">View details and manage this task</p>
            </div>
            <Link
              href={isRunner ? '/dashboard/runner' : '/dashboard/client'}
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-6 py-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Status</p>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-700'
                          : isAccepted
                          ? 'bg-sky-100 text-sky-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {task.status ? task.status.charAt(0).toUpperCase() + task.status.slice(1).replace('_', ' ') : 'Pending'}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">{task.title}</h2>
                  <p className="mt-2 text-slate-600">{task.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-600">Budget</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      R{task.budget ? task.budget.toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Deadline</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatDate(task.deadline)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Location</p>
                    <p className="mt-1 font-semibold text-slate-900 flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {typeof task.location === 'string' 
                        ? task.location 
                        : task.location?.address || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">Applicants</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{task.applicants?.length || 0}</p>
                  </div>
                </div>
              </div>

              {isRunner && isAccepted && (
                <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                  <div className="mb-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Submit work</p>
                    <h3 className="mt-1 text-xl font-semibold text-slate-900">Mark as complete</h3>
                  </div>
                  <div className="space-y-3">
                    <textarea
                      placeholder="Describe what you've completed, any deliverables, or notes for the client..."
                      value={completion}
                      onChange={(e) => setCompletion(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 transition focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      rows={5}
                    />
                    <button
                      onClick={handleCompleteTask}
                      disabled={submitting || !completion.trim()}
                      className="w-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-6 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:scale-[1.01] disabled:opacity-50"
                    >
                      {submitting ? <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> : null}
                      Submit for review
                    </button>
                  </div>
                </div>
              )}

              {isCompleted && (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-6 w-6 flex-shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-emerald-900">Task completed</h3>
                      <p className="mt-1 text-sm text-emerald-700">
                        This task has been completed and all parties have been notified.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isPending && isRunner && (
                <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-cyan-50 p-6">
                  <div className="flex items-start gap-3">
                    <Trophy className="h-6 w-6 flex-shrink-0 text-sky-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-sky-900">Ready to accept?</h3>
                      <p className="mt-1 text-sm text-sky-700">
                        Once accepted, you'll have until {formatDate(task.deadline)} to complete this task.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Posted by</p>
                  <h3 className="mt-1 font-semibold text-slate-900">{task.client?.firstName || 'Client'}</h3>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  {task.client?.bio || (task.client?.createdAt ? `Morongwa member since ${new Date(task.client.createdAt).getFullYear()}` : 'Morongwa member since NaN')}
                </p>
                {isRunner && task.status !== 'posted' && (
                  <Link
                    href={`/support?type=task_inquiry&taskId=${id}`}
                    className="w-full rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Message client
                  </Link>
                )}
              </div>

              {(task.status === 'in_progress' || task.status === 'accepted') && (
                <LiveTrackingMap 
                  runnerLocation={runnerLocation}
                  pickupLocation={task.pickupLocation}
                  deliveryLocation={task.deliveryLocation}
                />
              )}

              <div className="rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Escrow</p>
                    <h3 className="font-semibold text-slate-900">Escrow Details</h3>
                  </div>
                </div>
                {escrow ? (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500">Status</p>
                      <p className="font-semibold text-slate-900 capitalize">{escrow.status}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Total Held</p>
                      <p className="font-semibold text-slate-900">R{Number(escrow.totalHeld).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Commission (Admin)</p>
                      <p className="font-semibold text-slate-900">R{Number(escrow.fees?.commission || 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Runner Net</p>
                      <p className="font-semibold text-slate-900">R{Number(escrow.runnersNet || (task.budget * (1 - commissionRate))).toFixed(2)}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No escrow information available.</p>
                )}
              </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Timeline</p>
                    <h3 className="font-semibold text-slate-900">Key dates</h3>
                  </div>
                </div>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <span className="text-xs text-sky-600">•</span>
                    <span>Posted: {formatDate(task.createdAt)}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-xs text-sky-600">•</span>
                    <span>Deadline: {formatDate(task.deadline)}</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/60 bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 p-6 text-white shadow-xl shadow-sky-200">
                <p className="text-xs uppercase tracking-[0.25em]">Need help?</p>
                <h3 className="mt-2 text-lg font-semibold">Contact support</h3>
                <p className="mt-2 text-sm text-white/80">Got questions about this task? Our team is here to help.</p>
                <Link
                  href="/support"
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
                >
                  Get help
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default TaskDetailPage;
