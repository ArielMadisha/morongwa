'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Package, ArrowLeft, CheckCircle, Truck, ExternalLink, AlertTriangle, Loader2, Landmark, MessageCircle, Smartphone } from 'lucide-react';
import { checkoutAPI } from '@/lib/api';
import SiteHeader from '@/components/SiteHeader';
import ProtectedRoute from '@/components/ProtectedRoute';
import { formatCurrencyAmount } from '@/lib/formatCurrency';
import toast from 'react-hot-toast';

function formatPrice(price: number, currency?: string) {
  return formatCurrencyAmount(price, currency || 'ZAR');
}

export default function OrderPage() {
  const params = useParams();
  const orderId = params.orderId as string;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeSending, setDisputeSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    checkoutAPI
      .getOrder(orderId)
      .then((res) => setOrder(res.data?.data ?? res.data ?? null))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          <p className="text-slate-600">Loading order...</p>
        </div>
      </ProtectedRoute>
    );
  }

  if (!order) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-sky-50 to-white flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-600 mb-4">Order not found</p>
            <Link href="/marketplace" className="text-sky-600 hover:text-sky-700 font-medium">Back to marketplace</Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const items = order.items ?? [];
  const amounts = order.amounts ?? {};
  const breakdown = order.paymentBreakdown;
  const shipment = order.courierShipment;
  const delivery = order.delivery ?? {};
  const eftInstructions = order.eftInstructions;
  const orangeMoneyInstructions = order.orangeMoneyInstructions;
  const isEftPending = order.status === 'pending_payment' && order.paymentMethod === 'eft';
  const isOrangeMoneyPending = order.status === 'pending_payment' && order.paymentMethod === 'orange_money';
  const isManualPaymentPending = isEftPending || isOrangeMoneyPending;
  const orderCurrency = String(amounts.currency || eftInstructions?.currency || 'ZAR');

  const submitDispute = async () => {
    if (disputeReason.trim().length < 10) {
      toast.error('Please describe the issue (at least 10 characters)');
      return;
    }
    setDisputeSending(true);
    try {
      await checkoutAPI.openParcelDispute(orderId, disputeReason.trim());
      toast.success('Dispute submitted — we will follow up');
      setDisputeReason('');
      const res = await checkoutAPI.getOrder(orderId);
      setOrder(res.data?.data ?? res.data ?? null);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Could not submit dispute');
    } finally {
      setDisputeSending(false);
    }
  };

  const renderBreakdown = () => {
    if (breakdown?.items?.length) {
      return (
        <>
          {breakdown.items.map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-slate-700">
              <span>{item.title}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
              <span>{formatPrice((item.price ?? 0) * (item.qty ?? 1), orderCurrency)}</span>
            </div>
          ))}
          {breakdown.shippingBreakdown && breakdown.shippingBreakdown.length > 1 ? (
            breakdown.shippingBreakdown.map((s: any, i: number) => (
              <div key={i} className="flex justify-between text-slate-600">
                <span>Shipping ({s.storeName ?? 'Supplier'})</span>
                <span>{formatPrice(s.shippingCost ?? 0, orderCurrency)}</span>
              </div>
            ))
          ) : (
            <div className="flex justify-between text-slate-600">
              <span>Shipping Fee</span>
              <span>{formatPrice(breakdown?.shippingBreakdown?.[0]?.shippingCost ?? amounts.shipping ?? 0, orderCurrency)}</span>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        {items.map((item: any, i: number) => (
          <div key={i} className="flex justify-between text-slate-700">
            <span>{item.productId?.title ?? 'Product'}{item.qty > 1 ? ` ×${item.qty}` : ''}</span>
            <span>{formatPrice((item.price ?? 0) * (item.qty ?? 1), orderCurrency)}</span>
          </div>
        ))}
        <div className="flex justify-between text-slate-600">
          <span>Shipping Fee</span>
          <span>{formatPrice(amounts.shipping ?? 0, orderCurrency)}</span>
        </div>
      </>
    );
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-900">
        <SiteHeader />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-6 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to marketplace
          </Link>

          <div className="flex items-center gap-3 mb-6">
            {order.status === 'paid' && <CheckCircle className="h-10 w-10 text-emerald-500" />}
            {order.status === 'pending_payment' && (
              <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Order #{orderId?.slice(-8)}</h1>
              <p className="text-slate-600 capitalize">
                {order.status === 'pending_payment'
                  ? 'Awaiting payment — not paid yet'
                  : order.status?.replace('_', ' ')}
              </p>
            </div>
          </div>
          {order.status === 'pending_payment' && isOrangeMoneyPending && orangeMoneyInstructions && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-950 mb-6 space-y-3">
              <p className="font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-orange-600" />
                Pay with Orange Money to complete this order
              </p>
              <p>
                The Orange Money number and your payment reference were sent to{' '}
                <Link href="/messages" className="font-medium text-orange-700 underline">
                  Messenger
                </Link>
                .
              </p>
              <div className="rounded-lg bg-white border border-orange-100 p-3 space-y-1 font-mono text-xs">
                <p>
                  <span className="text-slate-500">Reference:</span> {orangeMoneyInstructions.reference}
                </p>
                <p>
                  <span className="text-slate-500">Amount:</span>{' '}
                  {formatCurrencyAmount(
                    orangeMoneyInstructions.amount ?? amounts.total ?? 0,
                    orangeMoneyInstructions.currency || amounts.currency || 'BWP'
                  )}
                </p>
                <p>
                  <span className="text-slate-500">Orange Money number:</span>{' '}
                  <span className="font-semibold text-orange-800">{orangeMoneyInstructions.orangeMoneyNumber}</span>
                </p>
              </div>
              <Link
                href="/messages"
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
              >
                <MessageCircle className="h-4 w-4" />
                Open Messenger
              </Link>
            </div>
          )}
          {order.status === 'pending_payment' && isEftPending && eftInstructions && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950 mb-6 space-y-3">
              <p className="font-semibold flex items-center gap-2">
                <Landmark className="h-4 w-4" />
                Pay by EFT to complete this order
              </p>
              <p>
                Bank details and your payment reference were sent to{' '}
                <Link href="/messages" className="font-medium text-sky-700 underline">
                  Messenger
                </Link>
                .{' '}
                {eftInstructions.referenceHint
                  ? `Use ${eftInstructions.referenceHint.toLowerCase()} as the payment reference when you pay.`
                  : 'Use the reference exactly when you pay.'}
              </p>
              <div className="rounded-lg bg-white border border-sky-100 p-3 space-y-1 font-mono text-xs">
                <p>
                  <span className="text-slate-500">Reference:</span> {eftInstructions.reference}
                </p>
                <p>
                  <span className="text-slate-500">Amount:</span>{' '}
                  {formatPrice(
                    eftInstructions.amount ?? eftInstructions.amountZar ?? amounts.total ?? 0,
                    eftInstructions.currency || orderCurrency
                  )}
                </p>
                <p>
                  <span className="text-slate-500">Bank:</span> {eftInstructions.bank?.bankName}
                </p>
                <p>
                  <span className="text-slate-500">Account holder:</span> {eftInstructions.bank?.accountHolder}
                </p>
                {eftInstructions.bank?.accountType ? (
                  <p>
                    <span className="text-slate-500">Account type:</span> {eftInstructions.bank.accountType}
                  </p>
                ) : null}
                <p>
                  <span className="text-slate-500">Account number:</span> {eftInstructions.bank?.accountNumber}
                </p>
                {eftInstructions.bank?.branchName ? (
                  <p>
                    <span className="text-slate-500">Branch:</span> {eftInstructions.bank.branchName}
                  </p>
                ) : null}
                {eftInstructions.bank?.branchCode ? (
                  <p>
                    <span className="text-slate-500">Branch code:</span> {eftInstructions.bank.branchCode}
                  </p>
                ) : null}
              </div>
              <Link
                href="/messages"
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
              >
                <MessageCircle className="h-4 w-4" />
                Open Messenger
              </Link>
            </div>
          )}
          {order.status === 'pending_payment' && !isManualPaymentPending && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-6 space-y-3">
              <p>
                This order is not complete until card payment succeeds. If you cancelled at the bank, use the
                button below to put items back in your cart.
              </p>
              <button
                type="button"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true);
                  try {
                    await checkoutAPI.cancelPayment(orderId);
                    toast.success('Payment cancelled — items restored to your cart');
                    const res = await checkoutAPI.getOrder(orderId);
                    setOrder(res.data?.data ?? res.data ?? null);
                  } catch (e: unknown) {
                    const err = e as { response?: { data?: { message?: string } } };
                    toast.error(err.response?.data?.message || 'Could not cancel payment');
                  } finally {
                    setCancelling(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-white border border-amber-300 px-4 py-2 font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                {cancelling ? 'Restoring cart…' : 'Cancel payment & restore cart'}
              </button>
            </div>
          )}

          <div className="bg-white/90 rounded-2xl border border-slate-100 p-6 space-y-4 mb-6">
            {items.map((item: any, i: number) => (
              <div key={i} className="flex gap-4 items-center">
                <div className="w-14 h-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Package className="h-6 w-6 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">
                    {item.productId?.title ?? 'Product'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {item.qty} × {formatPrice(item.price ?? 0, orderCurrency)} = {formatPrice((item.qty ?? 0) * (item.price ?? 0), orderCurrency)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {amounts.deliveryPrepaid && (amounts.shipping ?? 0) > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 mb-6 text-sm text-emerald-950">
              <p className="font-semibold">Delivery paid with this order</p>
              <p className="mt-1">
                {formatPrice(amounts.shipping, orderCurrency)} for delivery was included in your checkout total. You do not need to pay
                the courier separately for this fee.
              </p>
            </div>
          )}

          {(shipment || delivery.carrier) && (
            <div className="bg-white/90 rounded-2xl border border-slate-100 p-6 mb-6 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Truck className="h-5 w-5 text-sky-600" />
                Delivery & tracking
              </h3>
              <p className="text-sm text-slate-600">
                {shipment?.providerName || delivery.carrier}
                {(shipment?.serviceLabel || delivery.serviceLabel)
                  ? ` · ${shipment?.serviceLabel || delivery.serviceLabel}`
                  : ''}
              </p>
              {(delivery.courierFinalizedAt || shipment?.status === 'booked') && (
                <p className="text-xs text-emerald-700 font-medium">
                  Courier confirmed at checkout
                  {delivery.courierFinalizedAt
                    ? ` · ${new Date(delivery.courierFinalizedAt).toLocaleString()}`
                    : ''}
                </p>
              )}
              {delivery.estimatedDeliveryDaysMin != null && (
                <p className="text-xs text-slate-500">
                  Estimated {delivery.estimatedDeliveryDaysMin}–{delivery.estimatedDeliveryDaysMax} days
                </p>
              )}
              {shipment?.status && (
                <p className="text-sm capitalize text-slate-700">
                  Parcel status: <span className="font-medium">{String(shipment.status).replace(/_/g, ' ')}</span>
                </p>
              )}
              {(shipment?.trackingNumber || delivery.trackingNo) && (
                <p className="text-sm text-slate-800">
                  Tracking: <span className="font-mono">{shipment?.trackingNumber || delivery.trackingNo}</span>
                </p>
              )}
              {(shipment?.trackingUrl || delivery.trackingUrl) && (
                <a
                  href={shipment?.trackingUrl || delivery.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:underline"
                >
                  Track parcel <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {shipment?.disputeStatus && shipment.disputeStatus !== 'none' && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
                  <p className="font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Dispute: {shipment.disputeStatus}
                  </p>
                  {shipment.disputeReason ? <p className="mt-1">{shipment.disputeReason}</p> : null}
                  {shipment.disputeResolution ? (
                    <p className="mt-2 text-emerald-800">Resolution: {shipment.disputeResolution}</p>
                  ) : null}
                </div>
              )}
              {order.status !== 'cancelled' &&
                (!shipment || shipment.disputeStatus === 'none' || shipment.disputeStatus === 'closed') && (
                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">Problem with delivery? Open a parcel dispute.</p>
                    <textarea
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      rows={3}
                      placeholder="Describe what went wrong (late, damaged, not received…)"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={disputeSending}
                      onClick={submitDispute}
                      className="mt-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {disputeSending ? 'Submitting…' : 'Report parcel issue'}
                    </button>
                  </div>
                )}
            </div>
          )}

          <div className="bg-white/90 rounded-2xl border border-slate-100 p-6 space-y-2">
            <h3 className="font-semibold text-slate-900 mb-3">Payment breakdown</h3>
            {renderBreakdown()}
            <div className="flex justify-between font-bold text-slate-900 text-lg pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>{formatPrice(amounts.total ?? 0, orderCurrency)}</span>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
