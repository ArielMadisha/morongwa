'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { tasksAPI, walletAPI, cartAPI, API_URL } from '@/lib/api';
import { Task } from '@/lib/types';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Package,
  PlusCircle,
  Clock,
  CheckCircle,
  DollarSign,
  MapPin,
  Calendar,
  Loader2,
  LogOut,
  Wallet,
  User,
  MessageSquare,
  Menu,
  X,
  Home,
  HelpCircle,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import toast from 'react-hot-toast';

const clientNavItems = [
  { href: '/dashboard/client', label: 'Dashboard', icon: Package },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/cart', label: 'Cart', icon: ShoppingCart },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/pricing', label: 'Pricing', icon: Receipt },
  { href: '/support', label: 'Support', icon: HelpCircle },
];

function ClientDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('delivery');
  const [budget, setBudget] = useState('');
  const [location, setLocation] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupLat, setPickupLat] = useState<string>('');
  const [pickupLon, setPickupLon] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<string>('');
  const [deliveryLon, setDeliveryLon] = useState<string>('');
  const [estimatedDistance, setEstimatedDistance] = useState<number | null>(null);
  const [suggestedFee, setSuggestedFee] = useState<number | null>(null);
  const [quoteFromApi, setQuoteFromApi] = useState<{
    clientTotal: number;
    taskPrice: number;
    bookingFee: number;
    totalSurcharges: number;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [calculatingCost, setCalculatingCost] = useState(false);
  const [nearbyRunners, setNearbyRunners] = useState<Array<any>>([]);
  const [runnersCount, setRunnersCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Wallet states
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [topupAmount, setTopupAmount] = useState<string>('');
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [pendingTaskData, setPendingTaskData] = useState<any>(null);
  const [commissionRate, setCommissionRate] = useState<number>(0.15); // Default fallback
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetchTasks();
    fetchWalletBalance();
  }, []);

  useEffect(() => {
    cartAPI.get().then((res) => {
      const data = res.data?.data ?? res.data;
      const items = Array.isArray(data?.items) ? data.items : [];
      setCartCount(items.length);
    }).catch(() => setCartCount(0));
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await tasksAPI.getMyTasks();
      setTasks(response.data);
      // Get commission from first task if available
      if (response.data.commissionRate !== undefined) {
        setCommissionRate(response.data.commissionRate);
      }
    } catch (error) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletBalance = async () => {
    try {
      const { data } = await walletAPI.getBalance();
      setWalletBalance(data.balance || 0);
    } catch (error) {
      console.error('Wallet fetch error:', error);
      setWalletBalance(0);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const pickup = pickupLat && pickupLon ? { type: 'Point', coordinates: [parseFloat(pickupLon), parseFloat(pickupLat)], address: pickupAddress || undefined } : (location ? { type: 'Point', coordinates: [0,0], address: location } : undefined);
      const delivery = deliveryLat && deliveryLon ? { type: 'Point', coordinates: [parseFloat(deliveryLon), parseFloat(deliveryLat)], address: deliveryAddress || undefined } : undefined;

      const finalBudget = (budget && parseFloat(budget) > 0) ? parseFloat(budget) : (quoteFromApi?.taskPrice ?? (suggestedFee || 0));
      const totalRequired = quoteFromApi?.clientTotal ?? finalBudget;

      // Check wallet balance against total cost (what client actually pays)
      if (walletBalance < totalRequired) {
        setPendingTaskData({
          title,
          description,
          category,
          budget: finalBudget,
          totalRequired,
          pickupLocation: pickup,
          deliveryLocation: delivery,
        });
        setTopupAmount(String(Math.ceil(totalRequired - walletBalance)));
        setShowWalletModal(true);
        setSubmitting(false);
        return;
      }

      // Create task
      await tasksAPI.create({
        title,
        description,
        category,
        budget: finalBudget,
        pickupLocation: pickup,
        deliveryLocation: delivery,
      });
      toast.success('Task created successfully!');
      setShowCreateModal(false);
      setTitle('');
      setDescription('');
      setBudget('');
      setLocation('');
      setPickupAddress('');
      setPickupLat('');
      setPickupLon('');
      setDeliveryAddress('');
      setDeliveryLat('');
      setDeliveryLon('');
      fetchTasks();
      fetchWalletBalance();
    } catch (error: any) {
      const code = error?.response?.data?.code;
      const msg = error?.response?.data?.message || error?.response?.data?.error;
      // If backend signals insufficient funds, open wallet top-up modal automatically
      if (code === 'INSUFFICIENT_FUNDS' || (typeof msg === 'string' && msg.toLowerCase().includes('insufficient funds'))) {
        const pickup = pickupLat && pickupLon ? { type: 'Point', coordinates: [parseFloat(pickupLon), parseFloat(pickupLat)], address: pickupAddress || undefined } : (location ? { type: 'Point', coordinates: [0,0], address: location } : undefined);
        const delivery = deliveryLat && deliveryLon ? { type: 'Point', coordinates: [parseFloat(deliveryLon), parseFloat(deliveryLat)], address: deliveryAddress || undefined } : undefined;
        const finalBudget = (budget && parseFloat(budget) > 0) ? parseFloat(budget) : (quoteFromApi?.taskPrice ?? (suggestedFee || 0));
        const totalRequired = quoteFromApi?.clientTotal ?? finalBudget;
        setPendingTaskData({ title, description, category, budget: finalBudget, totalRequired, pickupLocation: pickup, deliveryLocation: delivery });
        const required = error?.response?.data?.requiredAmount;
        setTopupAmount(String(required ?? Math.max(0, Math.ceil(totalRequired - walletBalance))));
        setShowWalletModal(true);
        return;
      }
      toast.error(msg || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  // compute preview when coords change
  useEffect(() => {
    const parseNum = (v: string) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const pl = parseNum(pickupLat);
    const plon = parseNum(pickupLon);
    const dl = parseNum(deliveryLat);
    const dlon = parseNum(deliveryLon);
    if (pl !== null && plon !== null && dl !== null && dlon !== null) {
      import('@/lib/pricing').then(({ calculateDistanceKm, suggestFeeZAR }) => {
        const dist = calculateDistanceKm([plon, pl], [dlon, dl]);
        const distRounded = Math.round(dist * 100) / 100;
        setEstimatedDistance(distRounded);
        setSuggestedFee(suggestFeeZAR(distRounded));
      });
    } else {
      setEstimatedDistance(null);
      setSuggestedFee(null);
      setQuoteFromApi(null);
    }
  }, [pickupLat, pickupLon, deliveryLat, deliveryLon]);

  // Fetch full quote from API when we have distance; use budget if set, else suggested fee
  useEffect(() => {
    const customBudget = budget && parseFloat(budget) > 0 ? parseFloat(budget) : null;
    const taskPriceForQuote = customBudget ?? suggestedFee ?? (estimatedDistance != null ? 100 : 0);
    if (estimatedDistance == null || taskPriceForQuote <= 0) {
      setQuoteFromApi(null);
      return;
    }
    const controller = new AbortController();
    setQuoteLoading(true);
    fetch(`${API_URL}/pricing/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currency: 'ZAR',
        taskPrice: taskPriceForQuote,
        distanceKm: estimatedDistance,
        weightKg: 0,
        isPeak: false,
        isUrgent: false,
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const q = data.data;
          setQuoteFromApi({
            clientTotal: q.clientTotal,
            taskPrice: q.taskPrice,
            bookingFee: q.bookingFee,
            totalSurcharges: q.totalSurcharges ?? 0,
          });
        } else {
          setQuoteFromApi(null);
        }
      })
      .catch(() => setQuoteFromApi(null))
      .finally(() => setQuoteLoading(false));
    return () => controller.abort();
  }, [estimatedDistance, suggestedFee, budget]);

  // Auto-fill budget with quote task price when we get a new quote and user hasn't set a custom amount
  useEffect(() => {
    if (quoteFromApi != null && (!budget || parseFloat(budget) === 0)) {
      setBudget(String(quoteFromApi.taskPrice));
    }
  }, [quoteFromApi]);

  const handleCalculateDistanceAndCostRef = useRef<( () => Promise<void>) | null>(null);

  /** Build fallback queries for Nominatim (same logic as LocationAutocomplete) */
  const buildGeocodeFallbacks = (raw: string): string[] => {
    const withSA = raw.includes('South Africa') || raw.includes('SA') || raw.includes('ZA') ? raw : `${raw}, South Africa`;
    const parts = withSA.split(',').map((p) => p.trim()).filter(Boolean);
    const fallbacks: string[] = [withSA];
    const withoutPostal = parts.filter((p) => !/^\d{4}$/.test(p)).join(', ');
    if (withoutPostal && withoutPostal !== withSA) fallbacks.push(withoutPostal);
    if (parts.length >= 2) {
      const suburbCity = parts.slice(-3).join(', ');
      if (suburbCity && !fallbacks.includes(suburbCity)) fallbacks.push(suburbCity);
    }
    if (parts.length >= 1) {
      const cityOnly = parts[parts.length - 1];
      if (cityOnly && cityOnly !== 'South Africa') {
        fallbacks.push(`${cityOnly}, Gauteng, South Africa`);
        fallbacks.push(`${cityOnly}, South Africa`);
      }
    }
    return fallbacks;
  };

  /** Geocode a single address string via Nominatim with fallbacks; returns first result or null */
  const geocodeAddress = async (address: string): Promise<{ address: string; lat: string; lon: string } | null> => {
    const raw = address.trim();
    if (raw.length < 2) return null;
    const queries = buildGeocodeFallbacks(raw);
    const opts = { headers: { 'User-Agent': 'MorongwaApp/1.0', Accept: 'application/json' } };
    try {
      for (const q of queries) {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=za`,
          opts
        );
        if (!res.ok) continue;
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        const first = list[0];
        if (first?.lat != null && first?.lon != null) {
          return {
            address: first.display_name || (typeof first.address === 'string' ? first.address : raw),
            lat: String(first.lat),
            lon: String(first.lon),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleCalculateDistanceAndCost = async () => {
    const needPickup = !pickupLat || !pickupLon;
    const needDelivery = !deliveryLat || !deliveryLon;
    if (!needPickup && !needDelivery) {
      toast.success('Distance and cost are already calculated.');
      return;
    }
    if (!pickupAddress.trim() || !deliveryAddress.trim()) {
      toast.error('Please enter both pickup and delivery addresses.');
      return;
    }
    setCalculatingCost(true);
    try {
      if (needPickup) {
        const pickupResult = await geocodeAddress(pickupAddress);
        if (!pickupResult) {
          toast.error('Could not find pickup address. Try a more specific address or select from the suggestions.');
          setCalculatingCost(false);
          return;
        }
        setPickupAddress(pickupResult.address);
        setPickupLat(pickupResult.lat);
        setPickupLon(pickupResult.lon);
      }
      if (needDelivery) {
        const deliveryResult = await geocodeAddress(deliveryAddress);
        if (!deliveryResult) {
          toast.error('Could not find delivery address. Try a more specific address or select from the suggestions.');
          setCalculatingCost(false);
          return;
        }
        setDeliveryAddress(deliveryResult.address);
        setDeliveryLat(deliveryResult.lat);
        setDeliveryLon(deliveryResult.lon);
      }
      toast.success('Addresses resolved. Distance and cost will update below.');
    } catch (e) {
      toast.error('Failed to look up addresses. Please select from the suggestions instead.');
    } finally {
      setCalculatingCost(false);
    }
  };

  handleCalculateDistanceAndCostRef.current = handleCalculateDistanceAndCost;

  // Auto-calculate distance & cost when both addresses have text and we're missing coords (debounced)
  const autoCalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const needCoords = !pickupLat || !pickupLon || !deliveryLat || !deliveryLon;
    const hasText = pickupAddress.trim().length >= 2 && deliveryAddress.trim().length >= 2;
    if (!needCoords || !hasText || calculatingCost) return;
    if (autoCalcTimeoutRef.current) clearTimeout(autoCalcTimeoutRef.current);
    autoCalcTimeoutRef.current = setTimeout(() => {
      autoCalcTimeoutRef.current = null;
      handleCalculateDistanceAndCostRef.current?.();
    }, 1500);
    return () => {
      if (autoCalcTimeoutRef.current) clearTimeout(autoCalcTimeoutRef.current);
    };
  }, [pickupAddress, deliveryAddress, pickupLat, pickupLon, deliveryLat, deliveryLon, calculatingCost]);

  const findNearbyRunners = async () => {
    const pl = parseFloat(pickupLat || deliveryLat || '0');
    const plon = parseFloat(pickupLon || deliveryLon || '0');
    if (!pl || !plon) {
      toast.error('Please set a pickup or delivery coordinate to search for nearby runners');
      return;
    }

    try {
      const res = await fetch(`/api/runners/nearby?lat=${encodeURIComponent(String(pl))}&lon=${encodeURIComponent(String(plon))}&radius=15`);
      const data = await res.json();
      setNearbyRunners(data.runners || []);
      setRunnersCount(data.count || 0);
    } catch (e) {
      toast.error('Failed to find nearby runners');
    }
  };

  const handleWalletTopup = async () => {
    if (!topupAmount || parseFloat(topupAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setTopupSubmitting(true);
    try {
      const amount = parseFloat(topupAmount);
      const { data } = await walletAPI.topUp(amount);
      setWalletBalance(data.balance || 0);
      toast.success('Wallet topped up successfully!');
      setShowWalletModal(false);
      setTopupAmount('');

      // Now create the task with the new wallet balance
      if (pendingTaskData) {
        try {
          await tasksAPI.create(pendingTaskData);
          toast.success('Task created successfully!');
          setShowCreateModal(false);
          setTitle('');
          setDescription('');
          setBudget('');
          setLocation('');
          setPickupAddress('');
          setPickupLat('');
          setPickupLon('');
          setDeliveryAddress('');
          setDeliveryLat('');
          setDeliveryLon('');
          setPendingTaskData(null);
          fetchTasks();
        } catch (error: any) {
          toast.error(error.response?.data?.message || 'Failed to create task');
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to add funds to wallet');
    } finally {
      setTopupSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 flex">
      {/* Sidebar - desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:flex-shrink-0 bg-white/90 backdrop-blur-md border-r border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100">
          <Link href="/dashboard/client" className="flex items-center gap-2">
            <Package className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">Morongwa</span>
          </Link>
          <p className="text-xs text-slate-500 mt-1 truncate">Client · {user?.name}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {clientNavItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            const isCart = href === '/cart';
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {label}
                {isCart && cartCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-sky-600 px-1.5 text-xs font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <Home className="h-5 w-5 flex-shrink-0" />
            Home
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - mobile drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-xl transform transition-transform duration-200 ease-out lg:hidden ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <span className="font-bold text-slate-900">Menu</span>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-3 space-y-1">
          {clientNavItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            const isCart = href === '/cart';
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {label}
                {isCart && cartCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-sky-600 px-1.5 text-xs font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Home className="h-5 w-5 flex-shrink-0" />
            Home
          </Link>
          <button
            onClick={() => {
              setMenuOpen(false);
              handleLogout();
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            Logout
          </button>
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar with menu button and title */}
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-100 shadow-sm flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                  aria-label="Open menu"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Client Dashboard</h1>
                  <p className="text-sm text-slate-600 truncate">Welcome back, {user?.name}</p>
                </div>
              </div>
              <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
                <Link
                  href="/"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm font-medium"
                >
                  <Home className="h-4 w-4" />
                  Home
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 text-sm font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white/90 backdrop-blur-md p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Tasks</p>
                <p className="text-2xl font-bold text-slate-900">{tasks.length}</p>
              </div>
              <Package className="h-10 w-10 text-blue-600" />
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-md p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {tasks.filter((t) => t.status === 'pending').length}
                </p>
              </div>
              <Clock className="h-10 w-10 text-yellow-600" />
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-md p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">In Progress</p>
                <p className="text-2xl font-bold text-purple-600">
                  {tasks.filter((t) => t.status === 'in_progress' || t.status === 'accepted').length}
                </p>
              </div>
              <Loader2 className="h-10 w-10 text-purple-600" />
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-md p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {tasks.filter((t) => t.status === 'completed').length}
                </p>
              </div>
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
          </div>
        </div>

        {/* Create Task Button */}
        <div className="mb-6">
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 font-medium transition-all inline-flex items-center shadow-md"
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            Create New Task
          </button>
        </div>

        {/* Tasks List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white/90 backdrop-blur-md rounded-xl shadow p-12 text-center border border-slate-100">
            <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-900 mb-2">No tasks yet</h3>
            <p className="text-slate-600 mb-6">Create your first task to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 font-medium transition-all inline-flex items-center shadow-md"
            >
              <PlusCircle className="mr-2 h-5 w-5" />
              Create Task
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tasks.map((task) => (
              <div key={task._id} className="bg-white/90 backdrop-blur-md rounded-xl shadow hover:shadow-lg transition-shadow border border-slate-100">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">{task.title}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusColor(task.status)}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm mb-4 line-clamp-2">{task.description}</p>
                  <div className="space-y-2 mb-4">
                    {task.estimatedDistanceKm && (
                      <div className="flex items-center text-sm text-slate-600">
                        <MapPin className="h-4 w-4 mr-2" />
                        Distance: {task.estimatedDistanceKm} km
                      </div>
                    )}
                    <div className="flex items-center text-sm text-slate-600">
                      <DollarSign className="h-4 w-4 mr-2" />
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">R{task.budget}</div>
                        {task.suggestedFee && task.suggestedFee !== task.budget && (
                          <div className="text-xs text-slate-500">Suggested: R{task.suggestedFee}</div>
                        )}
                        {task.escrowed && (
                          <div className="mt-1 text-xs text-slate-600">
                            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 mr-2">Escrow held: R{task.budget}</span>
                            <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 mr-2">Runner net: R{(task.budget * (1 - commissionRate)).toFixed(2)}</span>
                            <span className="inline-block rounded-full bg-red-50 px-2 py-0.5">Commission: R{(task.budget * commissionRate).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {task.pickupLocation?.address && (
                      <div className="flex items-start text-sm text-slate-600">
                        <MapPin className="h-4 w-4 mr-2 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-xs text-slate-500">Pickup</div>
                          <div className="line-clamp-1">{task.pickupLocation.address}</div>
                        </div>
                      </div>
                    )}
                    {task.deliveryLocation?.address && (
                      <div className="flex items-start text-sm text-slate-600">
                        <MapPin className="h-4 w-4 mr-2 mt-0.5 text-green-600" />
                        <div className="flex-1">
                          <div className="text-xs text-slate-500">Delivery</div>
                          <div className="line-clamp-1">{task.deliveryLocation.address}</div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center text-sm text-slate-600">
                      <Calendar className="h-4 w-4 mr-2" />
                      {new Date(task.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Link
                    href={`/tasks/${task._id}`}
                    className="block w-full text-center bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 font-medium transition-all shadow-md"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white/95 backdrop-blur-xl rounded-2xl max-w-2xl w-full my-8 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Modal Header - Sticky */}
            <div className="sticky top-0 bg-white/95 border-b border-slate-100 p-6">
              <h2 className="text-2xl font-bold text-slate-900">Create New Task</h2>
              <p className="text-sm text-slate-600 mt-1">Fill in the details below to create a new errand task</p>
            </div>
            
            {/* Modal Content - Scrollable */}
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Pick up groceries"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Describe what needs to be done..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="delivery">Delivery</option>
                  <option value="shopping">Shopping</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="moving">Moving</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Pickup and Delivery Addresses — type to get address suggestions */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">📍 Pickup & Delivery Locations</label>
                <p className="text-xs text-slate-500 mb-2">Type an address to see suggestions; select one to use it.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Pickup address</label>
                    <LocationAutocomplete
                      value={pickupAddress}
                      placeholder="e.g., 123 Main St, Centurion"
                      onSelect={(r) => {
                        setPickupAddress(r.address);
                        setPickupLat(r.lat);
                        setPickupLon(r.lon);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Delivery address</label>
                    <LocationAutocomplete
                      value={deliveryAddress}
                      placeholder="e.g., 456 Oak Ave, Johannesburg"
                      onSelect={(r) => {
                        setDeliveryAddress(r.address);
                        setDeliveryLat(r.lat);
                        setDeliveryLon(r.lon);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Calculate distance & cost — use typed addresses if user hasn't selected from list */}
              <div>
                <button
                  type="button"
                  onClick={handleCalculateDistanceAndCost}
                  disabled={calculatingCost || !pickupAddress.trim() || !deliveryAddress.trim()}
                  className="w-full px-4 py-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition font-medium flex items-center justify-center gap-2"
                >
                  {calculatingCost ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Looking up addresses…
                    </>
                  ) : (
                    <>Calculate distance & cost</>
                  )}
                </button>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  {(!pickupLat || !deliveryLat) && pickupAddress.trim() && deliveryAddress.trim()
                    ? 'Distance & cost are calculated automatically in a few seconds, or click the button now.'
                    : 'Select an address from the suggestions, or type both addresses—distance & cost will calculate automatically.'}
                </p>
              </div>

              {/* Distance and auto-calculated pricing — always show area, with placeholder if no coords yet */}
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                {estimatedDistance !== null ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-slate-600 font-medium">Estimated Distance</p>
                        <p className="text-2xl font-bold text-slate-900">{estimatedDistance} <span className="text-sm">km</span></p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600 font-medium">Task budget (runner)</p>
                        <p className="text-2xl font-bold text-green-600">
                          {quoteLoading ? (
                            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                          ) : quoteFromApi ? (
                            `R${quoteFromApi.taskPrice.toFixed(2)}`
                          ) : (
                            suggestedFee != null ? `R${suggestedFee}` : '—'
                          )}
                        </p>
                      </div>
                    </div>
                    {quoteFromApi && (
                      <div className="mt-3 pt-3 border-t border-blue-200">
                        <p className="text-xs text-slate-600 font-medium">Total cost (what you pay)</p>
                        <p className="text-xl font-bold text-slate-900">R{quoteFromApi.clientTotal.toFixed(2)}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Includes booking fee (R{quoteFromApi.bookingFee.toFixed(2)}) + surcharges (R{quoteFromApi.totalSurcharges.toFixed(2)})
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-slate-600 font-medium">Distance & cost will appear here</p>
                    <p className="text-xs text-slate-500 mt-1">Enter both addresses above, then click “Calculate distance & cost”.</p>
                  </div>
                )}
              </div>

              {/* Find Nearby Runners */}
              <div>
                <button 
                  type="button" 
                  onClick={findNearbyRunners}
                  disabled={!pickupLat || !pickupLon}
                  className="w-full px-4 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition font-medium"
                >
                  Find nearby runners (15km)
                </button>
                {runnersCount !== null && (
                  <p className="text-sm text-slate-600 mt-2">Found <strong>{runnersCount}</strong> nearby runners. Showing up to 5:</p>
                )}
                {nearbyRunners.slice(0,5).map((r) => (
                  <div key={r._id} className="mt-2 p-3 border border-slate-200 rounded-lg text-sm bg-white hover:border-sky-300 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-slate-900">{r.name || 'Runner'}</div>
                        <div className="text-xs text-slate-500">{r.distanceKm} km away</div>
                      </div>
                      <a className="text-xs text-sky-600 hover:underline font-medium" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`}>View</a>
                    </div>
                  </div>
                ))}
              </div>

              {/* Budget and total cost — auto-filled from addresses; user can override budget */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-700">💰 Budget (R) — task amount (optional override)</label>
                  <div className="text-xs font-medium">
                    <span className="text-slate-600">Wallet: </span>
                    <span className={walletBalance >= (quoteFromApi?.clientTotal ?? 0) ? 'text-green-600' : 'text-amber-600'}>
                      R{walletBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={quoteFromApi ? `Auto: R${quoteFromApi.taskPrice.toFixed(2)}` : 'Enter amount or add addresses first'}
                  />
                </div>
                {quoteFromApi && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600 font-medium">Total cost for this trip (load wallet if needed)</p>
                    <p className="text-lg font-bold text-slate-900">R{quoteFromApi.clientTotal.toFixed(2)}</p>
                    {walletBalance < quoteFromApi.clientTotal && (
                      <p className="text-xs text-amber-700 mt-1">
                        You need R{(quoteFromApi.clientTotal - walletBalance).toFixed(2)} more. Add funds below before creating the task.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">General Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Johannesburg CBD (optional backup)"
                />
              </div>

              {/* Modal Footer - Sticky */}
              <div className="sticky bottom-0 bg-white/95 border-t border-slate-100 mt-6 -mx-6 -mb-6 px-6 py-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="inline-block animate-spin -ml-1 mr-2 h-4 w-4" />
                      Creating...
                    </>
                  ) : (
                    'Create Task'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wallet Top-up Modal */}
      {showWalletModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Add Funds to Wallet</h2>
            <p className="text-sm text-slate-600 mb-6">Your wallet balance is insufficient. Please add funds to create this task.</p>
            
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-slate-600 mb-1">Total cost for this task (amount to pay):</p>
              <p className="text-2xl font-bold text-slate-900 mb-1">R{(pendingTaskData?.totalRequired ?? pendingTaskData?.budget ?? 0).toFixed(2)}</p>
              <p className="text-xs text-slate-500 mb-2">Task amount (runner): R{pendingTaskData?.budget?.toFixed(2) ?? '0'}</p>
              <p className="text-xs text-slate-600 mb-1">Current wallet balance:</p>
              <p className="text-lg font-semibold text-red-600">R{walletBalance.toFixed(2)}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Amount to Add (R)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Minimum: R${Math.ceil(pendingTaskData?.budget - walletBalance || 0)}`}
              />
              <p className="text-xs text-slate-600 mt-2">
                ℹ️ Suggested: R{Math.ceil(pendingTaskData?.budget - walletBalance || 0)} to cover this task
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowWalletModal(false);
                  setTopupAmount('');
                  setPendingTaskData(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWalletTopup}
                disabled={topupSubmitting || !topupAmount}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:bg-green-400 disabled:cursor-not-allowed"
              >
                {topupSubmitting ? (
                  <>
                    <Loader2 className="inline-block animate-spin -ml-1 mr-2 h-4 w-4" />
                    Adding...
                  </>
                ) : (
                  'Add Funds & Create Task'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

export default function ProtectedClientDashboard() {
  return (
    <ProtectedRoute allowedRoles={['client']}>
      <ClientDashboard />
    </ProtectedRoute>
  );
}
