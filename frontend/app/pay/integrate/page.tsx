'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Copy, Check, ExternalLink } from 'lucide-react';
import ProtectedRoute from '@/components/ProtectedRoute';

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://qwertymates.com';

function IntegrateContent() {
  const { user } = useAuth();
  const [copied, setCopied] = useState<string | null>(null);
  const merchantId = (user as any)?._id || (user as any)?.id || '';
  const [amount, setAmount] = useState('99.99');
  const [reference, setReference] = useState('ORDER-123');
  const [returnUrl, setReturnUrl] = useState('https://yoursite.com/order/complete');
  const [name, setName] = useState('My Store');

  const embedUrl = `${BASE_URL}/pay/embed?merchant=${merchantId}&amount=${encodeURIComponent(amount)}&reference=${encodeURIComponent(reference)}&return_url=${encodeURIComponent(returnUrl)}&name=${encodeURIComponent(name)}`;

  const iframeCode = `<iframe
  src="${embedUrl}"
  width="100%"
  height="420"
  frameborder="0"
  allow="payment"
  title="ACBPayWallet Checkout"
></iframe>`;

  const scriptSnippet = `<!-- ACBPayWallet Embed - Add to your checkout page -->
<div id="acbpaywallet-checkout"></div>
<script>
(function() {
  var merchantId = '${merchantId}';
  var amount = 99.99;      // Your order amount
  var reference = 'ORDER-123';  // Your order ID
  var returnUrl = 'https://yoursite.com/thanks';
  var name = 'My Store';
  
  var params = new URLSearchParams({
    merchant: merchantId,
    amount: amount.toFixed(2),
    reference: reference,
    return_url: returnUrl,
    name: name
  });
  
  var iframe = document.createElement('iframe');
  iframe.src = '${BASE_URL}/pay/embed?' + params;
  iframe.width = '100%';
  iframe.height = '420';
  iframe.frameBorder = '0';
  iframe.title = 'ACBPayWallet Checkout';
  document.getElementById('acbpaywallet-checkout').appendChild(iframe);
  
  window.addEventListener('message', function(e) {
    if (e.data?.source === 'ACBPAYWALLET_EMBED' && e.data?.type === 'ACBPAYWALLET_PAYMENT_RESULT') {
      if (e.data.status === 'success') {
        window.location.href = e.data.returnUrl || returnUrl;
      } else {
        alert('Payment failed: ' + (e.data.error || 'Unknown error'));
      }
    }
  });
})();
</script>`;

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/wallet" className="text-sky-600 hover:underline text-sm mb-6 inline-block">← Back to wallet</Link>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Add ACBPayWallet to your site</h1>
        <p className="text-slate-600 mb-8">Embed ACBPayWallet on your checkout page so customers pay without leaving your site (like PayGate PayWeb3).</p>

        <div className="space-y-8">
          {/* Embed option */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Embed (recommended)</h2>
            <p className="text-sm text-slate-600 mb-4">Add this iframe to your checkout. The buyer stays on your site and pays in the embedded form.</p>
            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-slate-700">Preview params</label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="rounded-lg border px-3 py-2" />
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" className="rounded-lg border px-3 py-2" />
                <input type="text" value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)} placeholder="Return URL" className="rounded-lg border px-3 py-2 col-span-2" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Store name" className="rounded-lg border px-3 py-2" />
              </div>
            </div>
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto">{iframeCode}</pre>
              <button
                onClick={() => copy(iframeCode, 'iframe')}
                className="absolute top-2 right-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-1 hover:bg-slate-600"
              >
                {copied === 'iframe' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === 'iframe' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">Replace amount, reference, return_url, and name with your order values.</p>
          </div>

          {/* postMessage API */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Handle payment result</h2>
            <p className="text-sm text-slate-600 mb-4">Listen for postMessage to redirect or show success when payment completes.</p>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto">{`window.addEventListener('message', function(e) {
  if (e.data?.source === 'ACBPAYWALLET_EMBED' && e.data?.type === 'ACBPAYWALLET_PAYMENT_RESULT') {
    if (e.data.status === 'success') {
      window.location.href = e.data.returnUrl;  // or show thank-you
    } else {
      alert('Payment failed: ' + (e.data.error || 'Unknown error'));
    }
  }
});`}</pre>
            <button
              onClick={() => copy(`window.addEventListener('message', function(e) {
  if (e.data?.source === 'ACBPAYWALLET_EMBED' && e.data?.type === 'ACBPAYWALLET_PAYMENT_RESULT') {
    if (e.data.status === 'success') {
      window.location.href = e.data.returnUrl;
    } else {
      alert('Payment failed: ' + (e.data.error || 'Unknown error'));
    }
  }
});`, 'msg')}
              className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-1 hover:bg-slate-600"
            >
              {copied === 'msg' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied === 'msg' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Dynamic script */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Dynamic script</h2>
            <p className="text-sm text-slate-600 mb-4">For server-rendered pages: inject the iframe with JavaScript. Replace variables with your order data.</p>
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto max-h-64 overflow-y-auto">{scriptSnippet}</pre>
              <button
                onClick={() => copy(scriptSnippet, 'script')}
                className="absolute top-2 right-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs text-white flex items-center gap-1 hover:bg-slate-600"
              >
                {copied === 'script' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied === 'script' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Redirect option */}
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Redirect (alternative)</h2>
            <p className="text-sm text-slate-600 mb-4">Send customers to the full payment page. Useful for simple links or when embed is not supported.</p>
            <Link
              href={`/pay?merchant=${merchantId}&amount=100&reference=DEMO&return_url=${encodeURIComponent(BASE_URL + '/wallet')}&name=Store`}
              target="_blank"
              className="inline-flex items-center gap-2 text-sky-600 hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Open payment page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntegratePage() {
  return (
    <ProtectedRoute>
      <IntegrateContent />
    </ProtectedRoute>
  );
}
