'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { adminAPI } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Package,
  DollarSign,
  MessageSquare,
  AlertCircle,
  TrendingUp,
  Activity,
  LogOut,
  Shield,
  Loader2,
  ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';

function AdminDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await adminAPI.getStats();
      setStats(response.data);
    } catch (error: any) {
      toast.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-600">Welcome back, {user?.name}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 text-red-600 hover:text-red-700 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-blue-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Users</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalUsers || 0}</p>
                <p className="text-xs text-green-600 mt-1">
                  {stats?.activeUsers || 0} active
                </p>
              </div>
              <Users className="h-12 w-12 text-blue-600 opacity-50" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-green-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Tasks</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.totalTasks || 0}</p>
                <p className="text-xs text-blue-600 mt-1">
                  {stats?.activeTasks || 0} active
                </p>
              </div>
              <Package className="h-12 w-12 text-green-600 opacity-50" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-purple-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-gray-900">
                  R{stats?.totalRevenue?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  +{stats?.revenueGrowth || 0}% this month
                </p>
              </div>
              <DollarSign className="h-12 w-12 text-purple-600 opacity-50" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-orange-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Pending Payouts</p>
                <p className="text-3xl font-bold text-gray-900">
                  R{stats?.pendingPayouts?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-orange-600 mt-1">
                  {stats?.pendingPayoutCount || 0} requests
                </p>
              </div>
              <Activity className="h-12 w-12 text-orange-600 opacity-50" />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/admin/users"
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center justify-between mb-4">
                <Users className="h-10 w-10 text-blue-600" />
                <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Users</h3>
              <p className="text-sm text-gray-600">View, suspend, or activate user accounts</p>
            </Link>

            <Link
              href="/admin/tasks"
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center justify-between mb-4">
                <Package className="h-10 w-10 text-green-600" />
                <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-green-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Tasks</h3>
              <p className="text-sm text-gray-600">Monitor and moderate platform tasks</p>
            </Link>

            <Link
              href="/admin/payouts"
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center justify-between mb-4">
                <DollarSign className="h-10 w-10 text-purple-600" />
                <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-purple-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Approve Payouts</h3>
              <p className="text-sm text-gray-600">Process pending withdrawal requests</p>
            </Link>

            <Link
              href="/admin/support"
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center justify-between mb-4">
                <MessageSquare className="h-10 w-10 text-orange-600" />
                <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-orange-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Support Tickets</h3>
              <p className="text-sm text-gray-600">Respond to user support requests</p>
            </Link>

            <Link
              href="/admin/disputes"
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center justify-between mb-4">
                <AlertCircle className="h-10 w-10 text-red-600" />
                <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-red-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Resolve Disputes</h3>
              <p className="text-sm text-gray-600">Handle task and payment disputes</p>
            </Link>

            <Link
              href="/admin/analytics"
              className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-center justify-between mb-4">
                <TrendingUp className="h-10 w-10 text-indigo-600" />
                <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">View Analytics</h3>
              <p className="text-sm text-gray-600">Platform metrics and insights</p>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </div>
          <div className="p-6">
            {stats?.recentActivity?.length > 0 ? (
              <div className="space-y-4">
                {stats.recentActivity.map((activity: any, index: number) => (
                  <div key={index} className="flex items-start space-x-4 pb-4 border-b last:border-0">
                    <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Activity className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{activity.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No recent activity</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function ProtectedAdminDashboard() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
      <AdminDashboard />
    </ProtectedRoute>
  );
}
