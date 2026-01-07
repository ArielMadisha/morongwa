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
  Search,
  DollarSign,
  MapPin,
  Calendar,
  Loader2,
  LogOut,
  Wallet,
  User,
  MessageSquare,
  TrendingUp,
  CheckCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

function RunnerDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'my-tasks'>('available');

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
      toast.success('Task accepted successfully!');
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to accept task');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-purple-100 text-purple-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Package className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Runner Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome back, {user?.name}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/wallet"
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <Wallet className="h-5 w-5" />
                <span>Wallet</span>
              </Link>
              <Link
                href="/profile"
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <User className="h-5 w-5" />
                <span>Profile</span>
              </Link>
              <Link
                href="/messages"
                className="flex items-center space-x-2 text-gray-700 hover:text-blue-600 transition-colors"
              >
                <MessageSquare className="h-5 w-5" />
                <span>Messages</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-red-600 hover:text-red-700 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Available Tasks</p>
                <p className="text-2xl font-bold text-gray-900">{availableTasks.length}</p>
              </div>
              <Search className="h-10 w-10 text-blue-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Tasks</p>
                <p className="text-2xl font-bold text-purple-600">
                  {myTasks.filter((t) => t.status === 'accepted' || t.status === 'in_progress').length}
                </p>
              </div>
              <TrendingUp className="h-10 w-10 text-purple-600" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {myTasks.filter((t) => t.status === 'completed').length}
                </p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('available')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'available'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Available Tasks ({availableTasks.length})
            </button>
            <button
              onClick={() => setActiveTab('my-tasks')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'my-tasks'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Tasks ({myTasks.length})
            </button>
          </div>
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : activeTab === 'available' ? (
          availableTasks.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Search className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No available tasks</h3>
              <p className="text-gray-600">Check back later for new opportunities</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableTasks.map((task) => (
                <div key={task._id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
                  <div className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{task.title}</h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{task.description}</p>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 mr-2 text-green-600" />
                        <span className="font-semibold text-green-600">R{task.budget}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        {task.location}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        {new Date(task.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        href={`/tasks/${task._id}`}
                        className="flex-1 text-center bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 font-medium transition-colors"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleAcceptTask(task._id)}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          myTasks.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No active tasks</h3>
              <p className="text-gray-600">Accept a task from the Available tab to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myTasks.map((task) => (
                <div key={task._id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(task.status)}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{task.description}</p>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 mr-2 text-green-600" />
                        <span className="font-semibold text-green-600">R{task.budget}</span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        {task.location}
                      </div>
                    </div>
                    <Link
                      href={`/tasks/${task._id}`}
                      className="block w-full text-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
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
