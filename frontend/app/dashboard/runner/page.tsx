'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Package,
  Search,
  DollarSign,
  MapPin,
  Calendar,
  Loader2,
  LogOut,
  Wallet,
  User,
  MessageSquare,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { tasksAPI } from '@/lib/api';
import { Task } from '@/lib/types';

function RunnerDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'my-tasks'>('available');

  const activeCount = useMemo(
    () => myTasks.filter((t) => t.status === 'accepted' || t.status === 'in_progress').length,
    [myTasks]
  );
  const completedCount = useMemo(
    () => myTasks.filter((t) => t.status === 'completed').length,
    [myTasks]
  );

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const [available, mine] = await Promise.all([
        tasksAPI.getAvailable(),
        tasksAPI.getMyAcceptedTasks(),
      ]);
      setAvailableTasks(available.data);
      setMyTasks(mine.data);
    } catch (error) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTask = async (taskId: string) => {
    try {
      await tasksAPI.accept(taskId);
      toast.success('Task accepted successfully');
      fetchTasks();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Failed to accept task';
      
      // Check if it's a client insufficient funds error
      if (errorMsg.includes('insufficient funds') || errorMsg.includes('client has insufficient')) {
        toast.error('Cannot accept: Client needs to add funds to their wallet first');
      } else {
        toast.error(errorMsg);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-sky-100 text-sky-800';
      case 'in_progress':
        return 'bg-indigo-100 text-indigo-800';
      case 'completed':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Morongwa</p>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <Package className="h-4 w-4 text-sky-500" />
              <span>Runner cockpit</span>
            </div>
            <h1 className="mt-1 text-3xl font-semibold text-slate-900">Welcome back, {user?.name}</h1>
            <p className="text-slate-600">Pick up nearby tasks, move fast, stay verified.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/wallet"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Wallet className="h-4 w-4 text-sky-600" />
              Wallet
            </Link>
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <User className="h-4 w-4 text-sky-600" />
              Profile
            </Link>
            <Link
              href="/messages"
              className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <MessageSquare className="h-4 w-4 text-sky-600" />
              Messages
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-200 transition hover:scale-[1.01]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          {[{
            label: 'Available tasks',
            value: availableTasks.length,
            icon: <Search className="h-10 w-10 text-sky-500" />,
            accent: 'from-sky-50 to-white',
          }, {
            label: 'Active tasks',
            value: activeCount,
            icon: <CheckCircle className="h-10 w-10 text-indigo-500" />,
            accent: 'from-indigo-50 to-white',
          }, {
            label: 'Completed',
            value: completedCount,
            icon: <DollarSign className="h-10 w-10 text-emerald-500" />,
            accent: 'from-emerald-50 to-white',
          }].map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border border-white/60 bg-gradient-to-br ${card.accent} p-5 shadow-lg shadow-sky-50 backdrop-blur`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
                </div>
                <div className="rounded-xl bg-white/80 p-3 shadow-sm">{card.icon}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/60 bg-white/80 p-6 shadow-xl shadow-sky-50 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">Live feed</span>
              <p className="text-sm text-slate-600">Pick a task and move.</p>
            </div>
            <div className="flex gap-2 text-sm font-semibold">
              <button
                onClick={() => setActiveTab('available')}
                className={`rounded-full px-4 py-2 transition ${
                  activeTab === 'available'
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Available ({availableTasks.length})
              </button>
              <button
                onClick={() => setActiveTab('my-tasks')}
                className={`rounded-full px-4 py-2 transition ${
                  activeTab === 'my-tasks'
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                My tasks ({myTasks.length})
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            </div>
          ) : activeTab === 'available' ? (
            availableTasks.length === 0 ? (
              <div className="py-12 text-center text-slate-600">
                <Search className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-lg font-semibold text-slate-900">No tasks right now</p>
                <p className="text-sm">Stay close; new requests drop soon.</p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {availableTasks.map((task) => (
                  <div
                    key={task._id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white/90 p-5 shadow hover:-translate-y-1 hover:shadow-lg transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Task</p>
                          <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.description}</p>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">R{task.budget}</span>
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-sky-500" />
                          <span>
                            {typeof task.location === 'string' 
                              ? task.location 
                              : task.location?.address || 'Location not specified'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-sky-500" />
                          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 flex gap-3 text-sm font-semibold">
                      <Link
                        href={`/tasks/${task._id}`}
                        className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-center text-slate-800 transition hover:border-sky-200 hover:text-sky-700"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleAcceptTask(task._id)}
                        className="flex-1 rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-white shadow-md shadow-sky-200 transition hover:scale-[1.01]"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : myTasks.length === 0 ? (
            <div className="py-12 text-center text-slate-600">
              <Package className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-lg font-semibold text-slate-900">No active tasks</p>
              <p className="text-sm">Accept a task to start earning.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {myTasks.map((task) => (
                <div
                  key={task._id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-white/90 p-5 shadow hover:-translate-y-1 hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Task</p>
                      <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{task.description}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusColor(task.status)}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-emerald-500" />
                      <span>R{task.budget}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-sky-500" />
                      <span>
                        {typeof task.location === 'string' 
                          ? task.location 
                          : task.location?.address || 'Location not specified'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-sky-500" />
                      <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Link
                    href={`/tasks/${task._id}`}
                    className="mt-5 inline-flex w-full justify-center rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-200 transition hover:scale-[1.01]"
                  >
                    View details
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ProtectedRunnerDashboard() {
  return (
    <ProtectedRoute allowedRoles={['runner']}>
      <RunnerDashboard />
    </ProtectedRoute>
  );
}
