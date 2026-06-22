'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import { tasksAPI, walletAPI, API_URL } from '@/lib/api';
import { useCartAndStores } from '@/lib/useCartAndStores';
import { Task } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Package,
  PlusCircle,
  Clock,
  CheckCircle,
  DollarSign,
  MapPin,
  Calendar,
  Loader2,
  Wallet,
  MessageSquare,
  Menu,
  X,
  ShoppingCart,
  Store,
  LayoutDashboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { AppSidebar } from '@/components/AppSidebar';
import { AppShellHeader } from '@/components/AppShellHeader';
import { SearchButton } from '@/components/SearchButton';
import { ProfileHeaderButton } from '@/components/ProfileHeaderButton';
import { AdvertSlot } from '@/components/AdvertSlot';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { openPayGatePayment } from '@/lib/payGateRedirect';
import { WebAdPlacement } from '@/components/WebAdPlacement';

function ClientDashboard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [taskPhotoFile, setTaskPhotoFile] = useState<File | null>(null);
  const [taskType, setTaskType] = useState<'collect_send' | 'transport' | 'general'>('collect_send');
  const [originCountry, setOriginCountry] = useState('Botswana');
  const [deliveryMethod, setDeliveryMethod] = useState<'taxi' | 'bus' | 'border' | 'courier' | 'custom'>('taxi');
  const [itemType, setItemType] = useState<'fridge' | 'couch' | 'drums' | 'oil' | 'custom'>('fridge');
  const [vehicleType, setVehicleType] = useState<'bakkie' | 'small_truck'>('bakkie');
  const [customItemType, setCustomItemType] = useState('');
  const [customDeliveryDetails, setCustomDeliveryDetails] = useState('');
  const [parcelLengthCm, setParcelLengthCm] = useState('');
  const [parcelWidthCm, setParcelWidthCm] = useState('');
  const [parcelHeightCm, setParcelHeightCm] = useState('');
  const [parcelWeightKg, setParcelWeightKg] = useState('');
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
    totalClientPrice: number;
    taskPrice: number;
    runnerPayout: number;
    platformFee: number;
    bookingFee: number;
    totalSurcharges: number;
    distanceCost: number;
    taskAdjustment: number;
    deliveryFee: number;
    complexityFee: number;
    parcelSurcharge?: number;
    parcelBand?: string | null;
    chargeableWeightKg?: number;
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
  const { cartCount, hasStore } = useCartAndStores(!!user);

  const toPositiveOrNull = (v: string): number | null => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const dimensionLength = toPositiveOrNull(parcelLengthCm);
  const dimensionWidth = toPositiveOrNull(parcelWidthCm);
  const dimensionHeight = toPositiveOrNull(parcelHeightCm);
  const actualWeightKg = toPositiveOrNull(parcelWeightKg);
  const volumetricWeightKg =
    dimensionLength && dimensionWidth && dimensionHeight
      ? Math.round(((dimensionLength * dimensionWidth * dimensionHeight) / 5000) * 100) / 100
      : null;
  const chargeableWeightKg = Math.max(actualWeightKg || 0, volumetricWeightKg || 0);

  useEffect(() => {
    fetchTasks();
    fetchWalletBalance();
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
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 503) {
        toast.error('Service temporarily unavailable. Please try again in a moment.', { duration: 5000 });
      }
      setWalletBalance(0);
    }
  };

  const buildStructuredTask = () => {
    const pickup = pickupAddress.trim();
    const delivery = deliveryAddress.trim();
    const genericDesc = description.trim();
    if (taskType === 'collect_send') {
      return {
        title: `Collect & Send to ${originCountry}`,
        description:
          `Collect item(s) from ${pickup || 'pickup point'} and forward via ${deliveryMethod.toUpperCase()} to ${delivery || 'destination'}.\n` +
          `Origin country: ${originCountry}.\n` +
          `${customDeliveryDetails.trim() ? `Routing note: ${customDeliveryDetails.trim()}` : ''}`.trim(),
        category: 'delivery',
        workflowMeta: {
          taskType,
          originCountry,
          deliveryType: deliveryMethod,
          deliveryMethod,
          customDeliveryDetails: customDeliveryDetails.trim() || undefined,
        },
      };
    }
    if (taskType === 'transport') {
      const resolvedItem = itemType === 'custom' ? (customItemType.trim() || 'Custom item') : itemType;
      return {
        title: `Transport ${resolvedItem} (${vehicleType === 'small_truck' ? 'Small truck' : 'Bakkie'})`,
        description:
          `Transport ${resolvedItem} from ${pickup || 'pickup location'} to ${delivery || 'drop-off location'} using ${vehicleType === 'small_truck' ? 'small truck' : 'bakkie'}.\n` +
          `${genericDesc ? `Notes: ${genericDesc}` : ''}`,
        category: 'moving',
        workflowMeta: {
          taskType,
          itemType: resolvedItem,
          vehicleType,
        },
      };
    }
    return {
      title: title.trim() || 'General Errand',
      description: genericDesc,
      category: 'other',
      workflowMeta: {
        taskType: 'general',
      },
    };
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const structured = buildStructuredTask();
      if (!structured.description || structured.description.length < 3) {
        toast.error('Please complete the required workflow fields before creating the task.');
        setSubmitting(false);
        return;
      }
      let resolvedPickupAddress = pickupAddress;
      let resolvedPickupLat = pickupLat;
      let resolvedPickupLon = pickupLon;
      let resolvedDeliveryAddress = deliveryAddress;
      let resolvedDeliveryLat = deliveryLat;
      let resolvedDeliveryLon = deliveryLon;

      if (!resolvedPickupLat || !resolvedPickupLon) {
        if (pickupAddress.trim().length >= 2) {
          const pickupResult = await geocodeAddress(pickupAddress);
          if (pickupResult) {
            resolvedPickupAddress = pickupResult.address;
            resolvedPickupLat = pickupResult.lat;
            resolvedPickupLon = pickupResult.lon;
            setPickupAddress(pickupResult.address);
            setPickupLat(pickupResult.lat);
            setPickupLon(pickupResult.lon);
          }
        }
      }

      if (!resolvedDeliveryLat || !resolvedDeliveryLon) {
        if (deliveryAddress.trim().length >= 2) {
          const deliveryResult = await geocodeAddress(deliveryAddress);
          if (deliveryResult) {
            resolvedDeliveryAddress = deliveryResult.address;
            resolvedDeliveryLat = deliveryResult.lat;
            resolvedDeliveryLon = deliveryResult.lon;
            setDeliveryAddress(deliveryResult.address);
            setDeliveryLat(deliveryResult.lat);
            setDeliveryLon(deliveryResult.lon);
          }
        }
      }

      if (taskType !== 'general' && (!resolvedPickupLat || !resolvedPickupLon || !resolvedDeliveryLat || !resolvedDeliveryLon)) {
        toast.error('Please provide valid pickup and delivery addresses. You can type full addresses and the system will resolve them.');
        setSubmitting(false);
        return;
      }
      const pickup =
        resolvedPickupLat && resolvedPickupLon
          ? { type: 'Point', coordinates: [parseFloat(resolvedPickupLon), parseFloat(resolvedPickupLat)], address: resolvedPickupAddress || undefined }
          : (location ? { type: 'Point', coordinates: [0,0], address: location } : undefined);
      const delivery =
        resolvedDeliveryLat && resolvedDeliveryLon
          ? { type: 'Point', coordinates: [parseFloat(resolvedDeliveryLon), parseFloat(resolvedDeliveryLat)], address: resolvedDeliveryAddress || undefined }
          : undefined;

      const finalBudget = quoteFromApi?.taskPrice ?? (suggestedFee || 0);
      const totalRequired = quoteFromApi?.totalClientPrice ?? quoteFromApi?.clientTotal ?? finalBudget;
      const parcelDetails =
        dimensionLength || dimensionWidth || dimensionHeight || actualWeightKg
          ? {
              lengthCm: dimensionLength ?? undefined,
              widthCm: dimensionWidth ?? undefined,
              heightCm: dimensionHeight ?? undefined,
              weightKg: actualWeightKg ?? undefined,
              volumetricWeightKg: volumetricWeightKg ?? undefined,
              chargeableWeightKg: chargeableWeightKg || undefined,
            }
          : undefined;

      if ((taskType === 'collect_send' || taskType === 'transport') && !parcelDetails) {
        toast.error('Please provide parcel dimensions or weight so pricing can be calculated fairly.');
        setSubmitting(false);
        return;
      }
      if (taskType === 'transport' && !taskPhotoFile) {
        toast.error('Please upload an item photo for Transport Large Items.');
        setSubmitting(false);
        return;
      }

      // Check wallet balance against total cost (what client actually pays)
      if (walletBalance < totalRequired) {
        setPendingTaskData({
          title: structured.title,
          description: structured.description,
          category: structured.category,
          taskType,
          budget: finalBudget,
          totalRequired,
          pickupLocation: pickup,
          deliveryLocation: delivery,
          parcelDetails,
          workflowMeta: structured.workflowMeta,
        });
        setTopupAmount(String(Math.ceil(totalRequired - walletBalance)));
        setShowWalletModal(true);
        setSubmitting(false);
        return;
      }

      // Create task
      const formData = new FormData();
      formData.append('title', structured.title);
      formData.append('description', structured.description);
      formData.append('category', structured.category);
      formData.append('taskType', taskType);
      formData.append('budget', String(finalBudget));
      if (pickup) formData.append('pickupLocation', JSON.stringify(pickup));
      if (delivery) formData.append('deliveryLocation', JSON.stringify(delivery));
      if (parcelDetails) formData.append('parcelDetails', JSON.stringify(parcelDetails));
      formData.append('workflowMeta', JSON.stringify(structured.workflowMeta));
      if (invoiceFile) formData.append('supplierInvoice', invoiceFile);
      if (taskPhotoFile) formData.append('attachments', taskPhotoFile);
      await tasksAPI.create(formData);
      toast.success('Task created successfully!');
      setShowCreateModal(false);
      setCreateStep(1);
      setTitle('');
      setDescription('');
      setLocation('');
      setPickupAddress('');
      setPickupLat('');
      setPickupLon('');
      setDeliveryAddress('');
      setDeliveryLat('');
      setDeliveryLon('');
      setInvoiceFile(null);
      setParcelLengthCm('');
      setParcelWidthCm('');
      setParcelHeightCm('');
      setParcelWeightKg('');
      setTaskPhotoFile(null);
      setTaskType('collect_send');
      setOriginCountry('Botswana');
      setDeliveryMethod('taxi');
      setItemType('fridge');
      setVehicleType('bakkie');
      setCustomItemType('');
      setCustomDeliveryDetails('');
      fetchTasks();
      fetchWalletBalance();
    } catch (error: any) {
      const code = error?.response?.data?.code;
      const msg = error?.response?.data?.message || error?.response?.data?.error;
      // If backend signals insufficient funds, open wallet top-up modal automatically
      if (code === 'INSUFFICIENT_FUNDS' || (typeof msg === 'string' && msg.toLowerCase().includes('insufficient funds'))) {
        const structured = buildStructuredTask();
        const pickup = pickupLat && pickupLon ? { type: 'Point', coordinates: [parseFloat(pickupLon), parseFloat(pickupLat)], address: pickupAddress || undefined } : (location ? { type: 'Point', coordinates: [0,0], address: location } : undefined);
        const delivery = deliveryLat && deliveryLon ? { type: 'Point', coordinates: [parseFloat(deliveryLon), parseFloat(deliveryLat)], address: deliveryAddress || undefined } : undefined;
        const finalBudget = quoteFromApi?.taskPrice ?? (suggestedFee || 0);
        const totalRequired = quoteFromApi?.totalClientPrice ?? quoteFromApi?.clientTotal ?? finalBudget;
        const parcelDetails =
          dimensionLength || dimensionWidth || dimensionHeight || actualWeightKg
            ? {
                lengthCm: dimensionLength ?? undefined,
                widthCm: dimensionWidth ?? undefined,
                heightCm: dimensionHeight ?? undefined,
                weightKg: actualWeightKg ?? undefined,
                volumetricWeightKg: volumetricWeightKg ?? undefined,
                chargeableWeightKg: chargeableWeightKg || undefined,
              }
            : undefined;
        setPendingTaskData({
          title: structured.title,
          description: structured.description,
          category: structured.category,
          taskType,
          budget: finalBudget,
          totalRequired,
          pickupLocation: pickup,
          deliveryLocation: delivery,
          parcelDetails,
          workflowMeta: structured.workflowMeta,
        });
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

  // Fetch full quote from API when we have distance (system-calculated only)
  useEffect(() => {
    const typeBase =
      taskType === 'collect_send'
        ? 180
        : taskType === 'transport'
        ? 220
        : 90;
    const methodExtra =
      deliveryMethod === 'bus' || deliveryMethod === 'border'
        ? 35
        : deliveryMethod === 'courier'
        ? 25
        : deliveryMethod === 'custom'
        ? 40
        : 0;
    const taskPriceForQuote = suggestedFee ?? (estimatedDistance != null ? typeBase + methodExtra : 0);
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
        taskType,
        deliveryMethod,
        itemType: taskType === 'transport' ? itemType : undefined,
        vehicleType: taskType === 'transport' ? vehicleType : undefined,
        urgency: 'normal',
        itemCount: 1,
        waitingRequired: false,
        weightKg: chargeableWeightKg,
        actualWeightKg: actualWeightKg ?? 0,
        lengthCm: dimensionLength ?? 0,
        widthCm: dimensionWidth ?? 0,
        heightCm: dimensionHeight ?? 0,
        isPeak: false,
        isUrgent: false,
      }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const q = data.data;
          const totalClientPrice = q.totalClientPrice ?? q.clientTotal ?? 0;
          setQuoteFromApi({
            clientTotal: totalClientPrice,
            totalClientPrice,
            taskPrice: q.taskPrice,
            runnerPayout: q.runnerPayout ?? q.runnerNet ?? 0,
            platformFee: q.platformFee ?? q.commission ?? 0,
            bookingFee: q.bookingFee,
            totalSurcharges: q.totalSurcharges ?? 0,
            distanceCost: q.distanceCost ?? q.distanceSurcharge ?? 0,
            taskAdjustment: q.taskAdjustment ?? 0,
            deliveryFee: q.deliveryFee ?? 0,
            complexityFee: q.complexityFee ?? 0,
            parcelSurcharge: q.parcelSurcharge ?? q.heavySurcharge ?? 0,
            parcelBand: q.parcelBand ?? null,
            chargeableWeightKg: q.chargeableWeightKg ?? chargeableWeightKg,
          });
        } else {
          setQuoteFromApi(null);
        }
      })
      .catch(() => setQuoteFromApi(null))
      .finally(() => setQuoteLoading(false));
    return () => controller.abort();
  }, [estimatedDistance, suggestedFee, chargeableWeightKg, taskType, deliveryMethod]);

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

  /** Geocode via our API (server-side OSM + Photon, better partial matches) then Nominatim fallback */
  const geocodeAddress = async (address: string): Promise<{ address: string; lat: string; lon: string } | null> => {
    const raw = address.trim();
    if (raw.length < 2) return null;
    try {
      const apiRes = await fetch(`${API_URL}/pricing/address-suggest?${new URLSearchParams({ q: raw })}`);
      if (apiRes.ok) {
        const j = await apiRes.json();
        if (j?.success) {
          const nom = Array.isArray(j.nominatim) ? j.nominatim : [];
          const first = nom[0];
          if (first?.lat != null && first?.lon != null) {
            return {
              address: first.display_name || raw,
              lat: String(first.lat),
              lon: String(first.lon),
            };
          }
          const ph = Array.isArray(j.photon) ? j.photon : [];
          const f = ph[0];
          const coords = f?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            const props = f.properties || {};
            const label =
              [props.housenumber, props.street, props.city, props.country].filter(Boolean).join(', ') || raw;
            return {
              address: label,
              lat: String(coords[1]),
              lon: String(coords[0]),
            };
          }
        }
      }
    } catch {
      /* fall through */
    }
    const queries = buildGeocodeFallbacks(raw);
    const opts = { headers: { 'User-Agent': 'QwertymatesApp/1.0', Accept: 'application/json' } };
    try {
      for (const q of queries) {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=za`,
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
      const res = await fetch(`/api/runners/nearby?lat=${encodeURIComponent(String(pl))}&lon=${encodeURIComponent(String(plon))}&country=${encodeURIComponent(user?.countryCode || 'ZA')}`);
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
      if (pendingTaskData && typeof window !== 'undefined') {
        localStorage.setItem('pending_client_task_after_topup', JSON.stringify(pendingTaskData));
      }
      const { data } = await walletAPI.topUp(amount, '/dashboard/client');
      if (data?.paymentUrl || data?.payGateRedirect) {
        openPayGatePayment({ paymentUrl: data.paymentUrl, payGateRedirect: data.payGateRedirect });
        return;
      }
      toast.success('Top-up initiated');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message || 'Failed to add funds to wallet');
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

  return (
    <div className="min-h-[100dvh] min-h-screen flex flex-col bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900 overscroll-y-contain">
      <AppShellHeader
        onMenuClick={() => setMenuOpen((v) => !v)}
        center={
          <>
            <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <LayoutDashboard className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-brand-600" />
            </div>
            <h1 className="text-sm sm:text-base lg:text-lg font-semibold text-slate-900 min-w-0 break-words sm:truncate sm:max-w-none">
              Client Dashboard
            </h1>
          </>
        }
        actions={
          <>
            <SearchButton className="hidden lg:flex" />
            <ProfileHeaderButton />
          </>
        }
      />

      <div className="flex min-h-0 min-w-0 w-full flex-1 overflow-hidden">
        <AppSidebar
          variant="client"
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
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y">
        <div className="flex-1 flex gap-0 pt-3 sm:pt-6 min-h-0">
      <main className="flex-1 min-w-0 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pb-24 md:pb-8">
        <WebAdPlacement placement="dashboard_top" audience="generic" variant="video" className="mb-4" />
        {/* Stats — 2-up on phones to shorten vertical scroll */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
          <div className="bg-white/90 backdrop-blur-md p-3 sm:p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-slate-600">Total Tasks</p>
                <p className="text-lg sm:text-2xl font-bold text-slate-900">{tasks.length}</p>
              </div>
              <Package className="h-7 w-7 sm:h-10 sm:w-10 text-blue-600 shrink-0" />
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-md p-3 sm:p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-slate-600">Pending</p>
                <p className="text-lg sm:text-2xl font-bold text-yellow-600">
                  {tasks.filter((t) => t.status === 'pending').length}
                </p>
              </div>
              <Clock className="h-7 w-7 sm:h-10 sm:w-10 text-yellow-600 shrink-0" />
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-md p-3 sm:p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-slate-600">In Progress</p>
                <p className="text-lg sm:text-2xl font-bold text-purple-600">
                  {tasks.filter((t) => t.status === 'in_progress' || t.status === 'accepted').length}
                </p>
              </div>
              <Loader2 className="h-7 w-7 sm:h-10 sm:w-10 text-purple-600 shrink-0" />
            </div>
          </div>
          <div className="bg-white/90 backdrop-blur-md p-3 sm:p-6 rounded-xl shadow border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-slate-600">Completed</p>
                <p className="text-lg sm:text-2xl font-bold text-green-600">
                  {tasks.filter((t) => t.status === 'completed').length}
                </p>
              </div>
              <CheckCircle className="h-7 w-7 sm:h-10 sm:w-10 text-green-600 shrink-0" />
            </div>
          </div>
        </div>

        {/* Create Task Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              setCreateStep(1);
              setShowCreateModal(true);
            }}
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
              onClick={() => {
                setCreateStep(1);
                setShowCreateModal(true);
              }}
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
                  {task.taskType && (
                    <div className="mb-3">
                      <span className="inline-block rounded-full bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 font-medium">
                        {task.taskType.replace('_', ' ')}
                      </span>
                    </div>
                  )}
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

          <div className="hidden lg:block">
            <AdvertSlot belowHeader />
          </div>
        </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white/95 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl max-w-2xl w-full sm:my-8 shadow-2xl border border-slate-100 max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header - Sticky */}
            <div className="sticky top-0 bg-white/95 border-b border-slate-100 p-6">
              <h2 className="text-2xl font-bold text-slate-900">Create New Task</h2>
              <p className="text-sm text-slate-600 mt-1">Fill in the details below to create a new errand task</p>
            </div>
            
            {/* Modal Content - Scrollable */}
            <form onSubmit={handleCreateTask} className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Qwertymates Errands</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Structured task flows for cross-border collection &amp; send, large-item transport, and local errands.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">ZA → BW Botswana</span>
                  <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">ZA → LS Lesotho</span>
                  <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">ZA → ZW Zimbabwe</span>
                  <span className="rounded-full bg-slate-100 text-slate-700 px-2.5 py-1">ZA → MZ Mozambique</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">What do you want help with?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: 'collect_send', label: 'Collect & Send (Cross Border)', helper: 'Cross-border routing', icon: '📦' },
                    { id: 'transport', label: 'Transport Items (Large Items)', helper: 'Bakkie / truck', icon: '🚛' },
                    { id: 'general', label: 'Local Errand', helper: 'General local tasks', icon: '📍' },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setTaskType(option.id as typeof taskType)}
                      className={`text-left rounded-lg border px-3 py-2 transition ${
                        taskType === option.id
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-blue-300'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900">{option.icon} {option.label}</div>
                      <div className="text-xs text-slate-600">{option.helper}</div>
                    </button>
                  ))}
                </div>
              </div>

              {createStep === 1 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-semibold mb-1">We help you:</p>
                  <p>✅ Run errands in South Africa</p>
                  <p>✅ Collect and send goods to neighbouring countries</p>
                  <p>✅ Transport large items safely</p>
                  <p>✅ Connect with trusted local runners</p>
                </div>
              )}

              {createStep === 1 && (
                <button
                  type="button"
                  onClick={() => setCreateStep(2)}
                  className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium transition"
                >
                  Continue with this task type
                </button>
              )}

              {createStep === 2 && (
                <>

              {taskType === 'collect_send' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Origin country</label>
                    <select value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                      {['Botswana', 'Lesotho', 'Zimbabwe', 'Mozambique', 'Namibia', 'Zambia'].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Delivery method</label>
                    <select value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value as typeof deliveryMethod)} className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                      <option value="taxi">Taxi rank</option>
                      <option value="bus">Bus station</option>
                      <option value="border">Border drop-off</option>
                      <option value="courier">Courier office</option>
                      <option value="custom">Custom destination</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Routing notes (optional)</label>
                    <input value={customDeliveryDetails} onChange={(e) => setCustomDeliveryDetails(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="Taxi rank, bus line, border gate, or custom instruction" />
                  </div>
                </div>
              )}

              {taskType === 'transport' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Item category</label>
                    <select value={itemType} onChange={(e) => setItemType(e.target.value as typeof itemType)} className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                      <option value="fridge">Fridge</option>
                      <option value="couch">Couch</option>
                      <option value="drums">Drums</option>
                      <option value="oil">Oil</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Vehicle type</label>
                    <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value as typeof vehicleType)} className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                      <option value="bakkie">Bakkie</option>
                      <option value="small_truck">Small truck</option>
                    </select>
                  </div>
                  {itemType === 'custom' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Custom item name</label>
                      <input value={customItemType} onChange={(e) => setCustomItemType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg" placeholder="Describe the item" />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Upload item photo (required)</label>
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" required onChange={(e) => setTaskPhotoFile(e.target.files?.[0] ?? null)} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
                  </div>
                </div>
              )}

              {taskType === 'general' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">General task title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Collect documents from office"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Task description</label>
                    <textarea
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Describe what needs to be done..."
                    />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload Supplier invoice (Optional)</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Attach supplier quote/invoice to reduce delivery price disputes.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Parcel dimensions (for fair pricing)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Length (cm)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={parcelLengthCm}
                      onChange={(e) => setParcelLengthCm(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Width (cm)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={parcelWidthCm}
                      onChange={(e) => setParcelWidthCm(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Height (cm)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={parcelHeightCm}
                      onChange={(e) => setParcelHeightCm(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 25"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Actual weight (kg)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={parcelWeightKg}
                      onChange={(e) => setParcelWeightKg(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 4.5"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Chargeable weight is the higher of actual vs volumetric weight.
                  {volumetricWeightKg != null && (
                    <span className="font-medium text-slate-700"> Volumetric: {volumetricWeightKg.toFixed(2)}kg · Chargeable: {chargeableWeightKg.toFixed(2)}kg</span>
                  )}
                </p>
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
                      onAddressTextChange={(text) => {
                        setPickupAddress(text);
                        setPickupLat('');
                        setPickupLon('');
                      }}
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
                      onAddressTextChange={(text) => {
                        setDeliveryAddress(text);
                        setDeliveryLat('');
                        setDeliveryLon('');
                      }}
                      onSelect={(r) => {
                        setDeliveryAddress(r.address);
                        setDeliveryLat(r.lat);
                        setDeliveryLon(r.lon);
                      }}
                    />
                  </div>
                </div>
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
                        <p className="text-xs text-slate-600 font-medium">System task amount (runner)</p>
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
                        <p className="text-xs text-slate-600 font-medium">💰 Runner earns</p>
                        <p className="text-lg font-bold text-emerald-700">R{quoteFromApi.runnerPayout.toFixed(2)}</p>
                        <p className="text-xs text-slate-600 font-medium mt-2">💳 You pay</p>
                        <p className="text-xl font-bold text-slate-900">R{quoteFromApi.totalClientPrice.toFixed(2)}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Distance: R{quoteFromApi.distanceCost.toFixed(2)} · Service adjustment: R{quoteFromApi.taskAdjustment.toFixed(2)} · Delivery: R{quoteFromApi.deliveryFee.toFixed(2)} · Complexity: R{quoteFromApi.complexityFee.toFixed(2)} · Platform fee: R{quoteFromApi.platformFee.toFixed(2)}
                        </p>
                        {quoteFromApi.parcelBand && (
                          <p className="text-xs text-slate-600 mt-1">
                            Parcel band: <span className="font-semibold">{quoteFromApi.parcelBand}</span>
                            {quoteFromApi.parcelSurcharge != null ? ` · Parcel surcharge: R${quoteFromApi.parcelSurcharge.toFixed(2)}` : ''}
                            {quoteFromApi.chargeableWeightKg != null ? ` · Chargeable: ${quoteFromApi.chargeableWeightKg.toFixed(2)}kg` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-slate-600 font-medium">Distance & cost will appear here</p>
                    <p className="text-xs text-slate-500 mt-1">Enter pickup and delivery addresses above. Pricing appears automatically once resolved.</p>
                  </div>
                )}
              </div>
              <WebAdPlacement placement="errands_mid" audience="shopper" variant="offer" />

              {/* Fixed system-calculated pricing */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-700">Pricing</label>
                  <div className="text-xs font-medium">
                    <span className="text-slate-600">Wallet: </span>
                    <span className={walletBalance >= (quoteFromApi?.totalClientPrice ?? quoteFromApi?.clientTotal ?? 0) ? 'text-green-600' : 'text-amber-600'}>
                      R{walletBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
                {quoteFromApi && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600 font-medium">Task amount (runner)</p>
                    <p className="text-base font-semibold text-slate-900">R{quoteFromApi.taskPrice.toFixed(2)}</p>
                    <p className="text-xs text-slate-600 font-medium mt-1">Total cost to pay</p>
                    <p className="text-lg font-bold text-slate-900">R{(quoteFromApi.totalClientPrice ?? quoteFromApi.clientTotal).toFixed(2)}</p>
                    {walletBalance < (quoteFromApi.totalClientPrice ?? quoteFromApi.clientTotal) && (
                      <p className="text-xs text-amber-700 mt-1">
                        You need R{((quoteFromApi.totalClientPrice ?? quoteFromApi.clientTotal) - walletBalance).toFixed(2)} more. Add funds below before creating the task.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-500">
                Tip: type full pickup and delivery addresses (or pick suggestions) so distance and pricing resolve correctly.
              </p>
                </>
              )}

              {/* Modal Footer - Sticky */}
              <div className="sticky bottom-0 bg-white/95 border-t border-slate-100 mt-6 -mx-6 -mb-6 px-6 py-4 flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    if (createStep === 2) {
                      setCreateStep(1);
                      return;
                    }
                    setShowCreateModal(false);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                >
                  {createStep === 2 ? 'Back' : 'Cancel'}
                </button>
                {createStep === 2 ? (
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
                ) : (
                  <button
                    type="button"
                    onClick={() => setCreateStep(2)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                  >
                    Continue
                  </button>
                )}
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
      <MobileBottomNav cartCount={cartCount} hasStore={hasStore} />
    </div>
  );
}

export default function ProtectedClientDashboard() {
  return (
    <ProtectedRoute>
      <ClientDashboard />
    </ProtectedRoute>
  );
}
