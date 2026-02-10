'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { tasksAPI } from '@/lib/api';
import { Task } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  ArrowLeft,
  MapPin,
  DollarSign,
  Calendar,
  Loader2,
  Eye,
  Shield,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

function AdminTasksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionRate, setCommissionRate] = useState<number>(0.15);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      // Fetch all tasks via the generic tasks endpoint
      const response = await fetch('/api/tasks', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      setTasks(data.tasks || []);
      if (data.commissionRate !== undefined) {
        setCommissionRate(data.commissionRate);
      }
    } catch (error) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'posted':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-purple-100 text-purple-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-800">
      <header className="border-b border-white/60 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-full border border-slate-200 bg-white/80 p-2 shadow-sm transition hover:shadow-md"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-600">Admin</p>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <Package className="h-4 w-4 text-sky-500" />
                <span>Task Management</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold text-slate-900">All Platform Tasks</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-5 mb-8">
          {[
            { label: 'Total', value: tasks.length, status: 'all', color: 'slate' },
            { label: 'Posted', value: tasks.filter((t) => t.status === 'posted' || t.status === 'pending').length, status: 'posted', color: 'yellow' },
            { label: 'Accepted', value: tasks.filter((t) => t.status === 'accepted').length, status: 'accepted', color: 'blue' },
            { label: 'In Progress', value: tasks.filter((t) => t.status === 'in_progress').length, status: 'in_progress', color: 'purple' },
            { label: 'Completed', value: tasks.filter((t) => t.status === 'completed').length, status: 'completed', color: 'green' },
          ].map((stat) => (
            <button
              key={stat.status}
              onClick={() => setFilter(stat.status)}
              className={`rounded-2xl border p-5 shadow-lg backdrop-blur transition hover:-translate-y-0.5 ${
                filter === stat.status
                  ? 'border-sky-300 bg-white/90'
                  : 'border-white/60 bg-white/70'
              }`}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{stat.value}</p>
            </button>
          ))}
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-white/60 bg-white/80 p-12 text-center shadow-xl shadow-sky-50 backdrop-blur">
            <Package className="mx-auto mb-4 h-16 w-16 text-slate-300" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No tasks found</h3>
            <p className="text-slate-600">
              {filter === 'all' ? 'No tasks have been created yet.' : `No ${filter} tasks.`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => (
              <div
                key={task._id}
                className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                      </div>
                      <span className={`ml-3 px-3 py-1 text-xs rounded-full font-semibold ${getStatusColor(task.status)}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-slate-500">Client</p>
                        <p className="font-medium text-slate-900">{task.client?.name || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Runner</p>
                        <p className="font-medium text-slate-900">{task.runner?.name || 'Unassigned'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Budget</p>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-emerald-600" />
                          <span className="font-semibold text-slate-900">R{task.budget}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Created</p>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-sky-600" />
                          <span className="font-medium text-slate-900">{new Date(task.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Escrow Info */}
                    {task.escrowed && (
                      <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-gradient-to-r from-emerald-50 to-sky-50 p-3">
                        <div>
                          <p className="text-xs text-slate-600">Held</p>
                          <p className="font-semibold text-slate-900">R{task.budget}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Runner Net</p>
                          <p className="font-semibold text-emerald-700">R{(task.budget * (1 - commissionRate)).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600">Commission</p>
                          <p className="font-semibold text-red-700">R{(task.budget * commissionRate).toFixed(2)}</p>
                        </div>
                      </div>
                    )}

                    {task.pickupLocation?.address && (
                      <div className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                        <MapPin className="h-4 w-4 mt-0.5" />
                        <div>
                          <span className="text-xs text-slate-500">Pickup:</span> {task.pickupLocation.address}
                        </div>
                      </div>
                    )}
                    {task.deliveryLocation?.address && (
                      <div className="mt-1 flex items-start gap-2 text-sm text-slate-600">
                        <MapPin className="h-4 w-4 mt-0.5 text-green-600" />
                        <div>
                          <span className="text-xs text-slate-500">Delivery:</span> {task.deliveryLocation.address}
                        </div>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/tasks/${task._id}`}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                  >
                    <Eye className="h-4 w-4" />
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ProtectedAdminTasksPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminTasksPage />
    </ProtectedRoute>
  );
}
