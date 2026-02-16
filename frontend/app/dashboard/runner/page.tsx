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
  CheckCircle,
  ShoppingCart,
  Store,
  Shield,
  FileCheck,
  Car,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AppSidebar, AppSidebarMenuButton } from '@/components/AppSidebar';
import { ProfileDropdown } from '@/components/ProfileDropdown';
import { tasksAPI, productsAPI, usersAPI, getImageUrl } from '@/lib/api';
import { AdvertSlot } from '@/components/AdvertSlot';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { Task } from '@/lib/types';
import type { Product } from '@/lib/types';

function RunnerDashboard() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'my-tasks' | 'products'>('available');
  const [products, setProducts] = useState<Product[]>([]);
  const [commissionRate, setCommissionRate] = useState<number>(0.15);
  const [pdpUploading, setPdpUploading] = useState(false);
  const [vehicleUploading, setVehicleUploading] = useState(false);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const hasRunnerRole = user?.role && (Array.isArray(user.role) ? user.role.includes('runner') : user.role === 'runner');
  const needsVerification = hasRunnerRole && !user?.runnerVerified;
  const userId = user?._id || user?.id;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const activeCount = useMemo(
    () => myTasks.filter((t) => t.status === 'accepted' || t.status === 'in_progress').length,
    [myTasks]
  );
  const completedCount = useMemo(
    () => myTasks.filter((t) => t.status === 'completed').length,
    [myTasks]
  );

  useEffect(() => {
    if (hasRunnerRole) fetchTasks();
    else setLoading(false);
  }, [hasRunnerRole]);

  useEffect(() => {
    productsAPI
      .list({ limit: 12, random: true })
      .then((res) => {
        const raw = res.data?.data ?? res.data ?? [];
        setProducts(Array.isArray(raw) ? raw : (raw as any)?.products ?? []);
      })
      .catch(() => setProducts([]));
  }, []);

  const fetchTasks = async () => {
    try {
      const [available, mine] = await Promise.all([
        tasksAPI.getAvailable(),
        tasksAPI.getMyAcceptedTasks(),
      ]);
      setAvailableTasks(available.data);
      setMyTasks(mine.data);
      // Get commission from response if available
      if (available.data.commissionRate !== undefined) {
        setCommissionRate(available.data.commissionRate);
      } else if (mine.data.commissionRate !== undefined) {
        setCommissionRate(mine.data.commissionRate);
      }
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

  const handleStartTask = async (taskId: string) => {
    try {
      await tasksAPI.startTask(taskId);
      toast.success('Task started - tracking your location');
      fetchTasks();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to start task');
    }
  };

  const handlePdpUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setPdpUploading(true);
    try {
      await usersAPI.uploadPdp(userId, file);
      toast.success('PDP uploaded. Awaiting admin verification.');
      await refreshUser();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload PDP');
    } finally {
      setPdpUploading(false);
      e.target.value = '';
    }
  };

  const handleVehicleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = (e.target as HTMLFormElement).querySelector<HTMLInputElement>('input[type="file"]');
    const files = fileInput?.files ? Array.from(fileInput.files) : [];
    if (!userId || files.length === 0) {
      toast.error('Please select at least one document');
      return;
    }
    setVehicleUploading(true);
    try {
      await usersAPI.uploadVehicle(userId, { make: vehicleMake, model: vehicleModel, plate: vehiclePlate }, files);
      toast.success('Vehicle added. Awaiting admin verification.');
      await refreshUser();
      setVehicleMake('');
      setVehicleModel('');
      setVehiclePlate('');
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add vehicle');
    } finally {
      setVehicleUploading(false);
    }
  };

  const handleCheckArrival = async (taskId: string) => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await tasksAPI.checkArrival(taskId, {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
          
          if (response.data.atDestination) {
            toast.success(response.data.message);
          } else {
            toast((t) => (
              <span>{response.data.message}</span>
            ));
          }
        } catch (error: any) {
          toast.error(error.response?.data?.error || 'Failed to check arrival');
        }
      },
      (error) => {
        toast.error('Could not get your location');
      }
    );
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      <AppSidebar
        variant="runner"
        userName={user?.name}
        cartCount={cartCount}
        hasStore={hasStore}
        onLogout={handleLogout}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-visible">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0 overflow-visible">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <AppSidebarMenuButton onClick={() => setMenuOpen(true)} />
                <div className="min-w-0">
                  <p className="text-sm text-slate-600 truncate">Welcome back, {user?.name}</p>
                </div>
              </div>
              <div className="shrink-0">
                <ProfileDropdown userName={user?.name} />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex gap-6 pt-6 min-h-0">
      <main className="flex-1 min-w-0 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        {!hasRunnerRole && (
          <div className="mb-8 rounded-2xl border-2 border-sky-200 bg-sky-50/80 p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Become a verified runner</h2>
            <p className="text-slate-600 mb-6">Complete runner verification to accept tasks and earn. Requirements (Bolt-style):</p>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div className="flex gap-3 p-4 rounded-xl bg-white border border-sky-100">
                <FileCheck className="h-8 w-8 text-sky-600 shrink-0" />
                <div>
                  <h3 className="font-semibold text-slate-900">Driver&apos;s licence + PDP</h3>
                  <p className="text-sm text-slate-600">Professional Driving Permit required</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 rounded-xl bg-white border border-sky-100">
                <Shield className="h-8 w-8 text-sky-600 shrink-0" />
                <div>
                  <h3 className="font-semibold text-slate-900">Clear criminal record</h3>
                  <p className="text-sm text-slate-600">From recommended supplier; results shared with admin</p>
                </div>
              </div>
              <div className="flex gap-3 p-4 rounded-xl bg-white border border-sky-100">
                <Car className="h-8 w-8 text-sky-600 shrink-0" />
                <div>
                  <h3 className="font-semibold text-slate-900">Vehicle inspection</h3>
                  <p className="text-sm text-slate-600">CarScan or similar; automated report</p>
                </div>
              </div>
            </div>
            <Link
              href="/runner/apply"
              className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 transition-colors"
            >
              Apply to become a runner
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        )}
        {needsVerification && (
          <div className="mb-8 rounded-2xl border-2 border-amber-200 bg-amber-50/80 p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-2">Complete runner verification</h2>
            <p className="text-slate-600 mb-6">Upload your documents for admin approval. You need PDP and at least one vehicle to become verified.</p>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl bg-white border border-amber-100">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-sky-600" />
                  Professional Driving Permit (PDP)
                </h3>
                {user?.pdp ? (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className={`h-5 w-5 ${user.pdp.verified ? 'text-emerald-600' : 'text-amber-500'}`} />
                    <span>{user.pdp.verified ? 'Verified by admin' : 'Uploaded – pending verification'}</span>
                    {user.pdp.path && (
                      <a href={user.pdp.path} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">View</a>
                    )}
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-sky-100 text-sky-700 rounded-lg cursor-pointer hover:bg-sky-200 transition">
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handlePdpUpload} disabled={pdpUploading} className="hidden" />
                    {pdpUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
                    {pdpUploading ? 'Uploading...' : 'Upload PDP (PDF or image)'}
                  </label>
                )}
              </div>
              <div className="p-5 rounded-xl bg-white border border-amber-100">
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <Car className="h-5 w-5 text-sky-600" />
                  Vehicle ({((user?.vehicles?.length) ?? 0)}/3)
                </h3>
                {user?.vehicles && user.vehicles.length > 0 && (
                  <ul className="space-y-1 mb-3 text-sm">
                    {user.vehicles.map((v, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle className={`h-4 w-4 ${v.verified ? 'text-emerald-600' : 'text-amber-500'}`} />
                        {v.make || v.model || v.plate || `Vehicle ${i + 1}`} {v.verified ? '(verified)' : '(pending)'}
                      </li>
                    ))}
                  </ul>
                )}
                {((user?.vehicles?.length) ?? 0) < 3 && (
                  <form onSubmit={handleVehicleUpload} className="space-y-2">
                    <input type="text" placeholder="Make" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input type="text" placeholder="Model" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <input type="text" placeholder="Plate" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-slate-600">Documents (licence, inspection)</span>
                      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="rounded-lg border border-slate-200 text-sm" required />
                    </label>
                    <button type="submit" disabled={vehicleUploading} className="w-full mt-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
                      {vehicleUploading ? 'Uploading...' : 'Add vehicle'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
        {hasRunnerRole && (
        <>
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
            <div className="flex gap-2 text-sm font-semibold flex-wrap">
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
              <button
                onClick={() => setActiveTab('products')}
                className={`rounded-full px-4 py-2 transition ${
                  activeTab === 'products'
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-200'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Products ({products.length})
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
                        <div className="flex gap-2">
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">R{task.budget}</span>
                          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">Net: R{(task.budget * (1 - commissionRate)).toFixed(2)}</span>
                        </div>
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
          ) : activeTab === 'products' ? (
            products.length === 0 ? (
              <div className="py-12 text-center text-slate-600">
                <Package className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-3 text-lg font-semibold text-slate-900">No products yet</p>
                <p className="text-sm">Products from the marketplace will show here.</p>
                <Link href="/marketplace" className="mt-4 inline-block text-sky-600 hover:text-sky-700 font-medium">
                  Browse marketplace
                </Link>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => (
                  <Link
                    key={p._id}
                    href={`/marketplace/product/${p._id}`}
                    className="rounded-2xl border border-slate-100 bg-white/90 overflow-hidden shadow hover:-translate-y-1 hover:shadow-lg transition"
                  >
                    <div className="aspect-square bg-slate-100 flex items-center justify-center">
                      {p.images?.[0] ? (
                        <img src={getImageUrl(p.images[0])} alt={p.title} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-12 w-12 text-slate-300" />
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-900 line-clamp-2">{p.title}</h3>
                      <div className="mt-1">
                        {p.discountPrice != null && p.discountPrice < p.price ? (
                          <>
                            <span className="font-bold text-sky-600">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: p.currency || 'ZAR' }).format(p.discountPrice)}</span>
                            <span className="ml-1 text-sm text-slate-400 line-through">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: p.currency || 'ZAR' }).format(p.price)}</span>
                          </>
                        ) : (
                          <p className="font-bold text-slate-900">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: p.currency || 'ZAR' }).format(p.price)}</p>
                        )}
                      </div>
                    </div>
                  </Link>
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
                      <div className="flex-1">
                        <div className="font-semibold text-emerald-700">Gross: R{task.budget}</div>
                        <div className="text-xs text-slate-600">Net (after {(commissionRate * 100).toFixed(0)}%): R{(task.budget * (1 - commissionRate)).toFixed(2)}</div>
                        {task.estimatedDistanceKm && (
                          <div className="text-xs text-slate-500">{task.estimatedDistanceKm} km</div>
                        )}
                      </div>
                    </div>
                    {task.pickupLocation?.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-sky-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs text-slate-500">Pickup</div>
                          <div className="line-clamp-1">{task.pickupLocation.address}</div>
                        </div>
                      </div>
                    )}
                    {task.deliveryLocation?.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-green-500 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs text-slate-500">Delivery</div>
                          <div className="line-clamp-1">{task.deliveryLocation.address}</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-sky-500" />
                      <span>{new Date(task.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2">
                    {task.status === 'accepted' && (
                      <button
                        onClick={() => handleStartTask(task._id)}
                        className="flex-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01]"
                      >
                        Start Errand
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <>
                        <button
                          onClick={() => handleCheckArrival(task._id)}
                          className="flex-1 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:scale-[1.01]"
                        >
                          Check Arrival
                        </button>
                      </>
                    )}
                    <Link
                      href={`/tasks/${task._id}`}
                      className="flex-1 inline-flex justify-center rounded-full bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-200 transition hover:scale-[1.01]"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </main>

          <AdvertSlot />
        </div>
      </div>
    </div>
  );
}

export default function ProtectedRunnerDashboard() {
  return (
    <ProtectedRoute>
      <RunnerDashboard />
    </ProtectedRoute>
  );
}
