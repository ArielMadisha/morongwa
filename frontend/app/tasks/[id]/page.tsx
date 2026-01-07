'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { tasksAPI, reviewsAPI } from '@/lib/api';
import { Task } from '@/lib/types';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  User,
  Star,
  CheckCircle,
  XCircle,
  Loader2,
  MessageSquare,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Review modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  useEffect(() => {
    fetchTask();
  }, [params.id]);

  const fetchTask = async () => {
    try {
      const response = await tasksAPI.getById(params.id as string);
      setTask(response.data);
    } catch (error) {
      toast.error('Failed to load task');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    setActionLoading(true);
    try {
      await tasksAPI.accept(params.id as string);
      toast.success('Task accepted!');
      fetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to accept task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await tasksAPI.start(params.id as string);
      toast.success('Task started!');
      fetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to start task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    setActionLoading(true);
    try {
      await tasksAPI.complete(params.id as string);
      toast.success('Task completed!');
      fetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to complete task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this task?')) return;
    
    setActionLoading(true);
    try {
      await tasksAPI.cancel(params.id as string);
      toast.success('Task cancelled');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to cancel task');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await reviewsAPI.create({
        task: params.id as string,
        runner: task?.runner?._id,
        rating,
        comment,
      });
      toast.success('Review submitted successfully!');
      setShowReviewModal(false);
      fetchTask();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to submit review');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: any = {
      pending: <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">Pending</span>,
      accepted: <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">Accepted</span>,
      in_progress: <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">In Progress</span>,
      completed: <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">Completed</span>,
      cancelled: <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">Cancelled</span>,
    };
    return badges[status] || <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full">{status}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Task not found</h2>
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isClient = user?._id === task.client?._id;
  const isRunner = user?._id === task.runner?._id;
  const canAccept = user?.role === 'runner' && task.status === 'pending' && !isClient;
  const canStart = isRunner && task.status === 'accepted';
  const canComplete = isRunner && task.status === 'in_progress';
  const canCancel = isClient && (task.status === 'pending' || task.status === 'accepted');
  const canReview = isClient && task.status === 'completed' && !task.review;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Back to Dashboard
        </Link>

        {/* Task Card */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">{task.title}</h1>
                <div className="flex items-center space-x-4 text-sm opacity-90">
                  <span className="flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1" />
                    {task.location}
                  </span>
                </div>
              </div>
              <div>{getStatusBadge(task.status)}</div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Description */}
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Description</h2>
              <p className="text-gray-600 leading-relaxed">{task.description}</p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-green-50 p-6 rounded-lg">
                <div className="flex items-center mb-2">
                  <DollarSign className="h-5 w-5 text-green-600 mr-2" />
                  <h3 className="font-semibold text-gray-900">Budget</h3>
                </div>
                <p className="text-3xl font-bold text-green-600">R{task.budget}</p>
              </div>

              <div className="bg-blue-50 p-6 rounded-lg">
                <div className="flex items-center mb-2">
                  <User className="h-5 w-5 text-blue-600 mr-2" />
                  <h3 className="font-semibold text-gray-900">Category</h3>
                </div>
                <p className="text-lg font-medium text-gray-900 capitalize">{task.category}</p>
              </div>
            </div>

            {/* Client Info */}
            <div className="border-t pt-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Client</h2>
              <div className="flex items-center space-x-4">
                <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{task.client?.name}</p>
                  <p className="text-sm text-gray-600">{task.client?.email}</p>
                </div>
                {task.client && (
                  <Link
                    href={`/messages?user=${task.client._id}`}
                    className="ml-auto flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Message</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Runner Info (if assigned) */}
            {task.runner && (
              <div className="border-t pt-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Runner</h2>
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <User className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{task.runner.name}</p>
                    <p className="text-sm text-gray-600">{task.runner.email}</p>
                    {task.runner.rating > 0 && (
                      <div className="flex items-center mt-1">
                        <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        <span className="text-sm text-gray-600 ml-1">{task.runner.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/messages?user=${task.runner._id}`}
                    className="ml-auto flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Message</span>
                  </Link>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="border-t pt-6">
              <div className="flex flex-wrap gap-4">
                {canAccept && (
                  <button
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="flex-1 sm:flex-none bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed inline-flex items-center justify-center"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="animate-spin mr-2 h-5 w-5" />
                        Accepting...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Accept Task
                      </>
                    )}
                  </button>
                )}

                {canStart && (
                  <button
                    onClick={handleStart}
                    disabled={actionLoading}
                    className="flex-1 sm:flex-none bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:bg-purple-400 disabled:cursor-not-allowed inline-flex items-center justify-center"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="animate-spin mr-2 h-5 w-5" />
                        Starting...
                      </>
                    ) : (
                      'Start Task'
                    )}
                  </button>
                )}

                {canComplete && (
                  <button
                    onClick={handleComplete}
                    disabled={actionLoading}
                    className="flex-1 sm:flex-none bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium transition-colors disabled:bg-green-400 disabled:cursor-not-allowed inline-flex items-center justify-center"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="animate-spin mr-2 h-5 w-5" />
                        Completing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-5 w-5" />
                        Mark Complete
                      </>
                    )}
                  </button>
                )}

                {canReview && (
                  <button
                    onClick={() => setShowReviewModal(true)}
                    className="flex-1 sm:flex-none bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 font-medium transition-colors inline-flex items-center justify-center"
                  >
                    <Star className="mr-2 h-5 w-5" />
                    Leave Review
                  </button>
                )}

                {canCancel && (
                  <button
                    onClick={handleCancel}
                    disabled={actionLoading}
                    className="flex-1 sm:flex-none bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 font-medium transition-colors disabled:bg-red-400 disabled:cursor-not-allowed inline-flex items-center justify-center"
                  >
                    {actionLoading ? (
                      <>
                        <Loader2 className="animate-spin mr-2 h-5 w-5" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <XCircle className="mr-2 h-5 w-5" />
                        Cancel Task
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Leave a Review</h2>
            <form onSubmit={handleReview} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rating</label>
                <div className="flex space-x-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="focus:outline-none"
                    >
                      <Star
                        className={`h-8 w-8 ${
                          star <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                <textarea
                  required
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Share your experience..."
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="inline-block animate-spin -ml-1 mr-2 h-4 w-4" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Review'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
