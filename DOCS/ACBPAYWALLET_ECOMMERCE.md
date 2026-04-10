# ACBPayWallet Payment Page for E-commerce

For **in-person cash agents** (KYC, admin approval, float requirements), see **[ACBPAYWALLET_MERCHANT_AGENTS.md](./ACBPAYWALLET_MERCHANT_AGENTS.md)**.

Merchants can integrate ACBPayWallet so their website customers can pay using wallet balance or stored cards. **Embed (PayGate PayWeb3 style)** keeps the buyer on your site; **redirect** sends them to the payment page.

## Embed (recommended)

Embed the ACBPayWallet checkout on your checkout page. The buyer stays on your site and pays in the embedded form.

### Embed URL

```
https://your-domain.com/pay/embed?merchant={merchantUserId}&amount={amount}&reference={reference}&return_url={encodedReturnUrl}&cancel_url={encodedCancelUrl}&name={merchantDisplayName}
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `merchant` or `m` | Yes | Your user ID (the wallet that receives the payment) |
| `amount` or `a` | Yes | Amount in ZAR (e.g. 99.99) |
| `reference` or `r` | Yes | Your order/reference ID (max 120 chars) |
| `return_url` or `return` | Yes | URL to redirect after success (URL-encoded) |
| `cancel_url` or `cancel` | No | URL to redirect if customer cancels |
| `name` or `n` | No | Your store/merchant display name |

### Iframe embed

```html
<iframe
  src="https://qwertymates.com/pay/embed?merchant=YOUR_USER_ID&amount=99.99&reference=ORDER-123&return_url=https%3A%2F%2Fyoursite.com%2Fthanks&name=My%20Store"
  width="100%"
  height="420"
  frameborder="0"
  allow="payment"
  title="ACBPayWallet Checkout"
></iframe>
```

### postMessage API

When payment completes, the embed sends a message to the parent page. Listen for it to redirect or show success:

```javascript
window.addEventListener('message', function(e) {
  if (e.data?.source === 'ACBPAYWALLET_EMBED' && e.data?.type === 'ACBPAYWALLET_PAYMENT_RESULT') {
    if (e.data.status === 'success') {
      window.location.href = e.data.returnUrl;  // Full redirect URL with status, reference, amount
    } else {
      alert('Payment failed: ' + (e.data.error || 'Unknown error'));
    }
  }
});
```

Message payload on success: `{ source, type, status, reference, amount, returnUrl }`  
Message payload on failure: `{ source, type, status, error }`

---

## Redirect

Send customers to the full payment page. Useful for simple links or when embed is not supported.

### Payment URL

```
https://your-domain.com/pay?merchant={merchantUserId}&amount={amount}&reference={reference}&return_url={encodedReturnUrl}&cancel_url={encodedCancelUrl}&name={merchantDisplayName}
```

### Return URL query params

After payment, customers are redirected to your `return_url` with:

- `status=success` or `status=failed`
- `reference` – your reference
- `amount` – paid amount

Example: `https://yoursite.com/order/complete?status=success&reference=ORDER-123&amount=99.99`

### Integration examples

```html
<a href="https://qwertymates.com/pay?merchant=YOUR_USER_ID&amount=99.99&reference=ORDER-123&return_url=https%3A%2F%2Fyoursite.com%2Fthanks&cancel_url=https%3A%2F%2Fyoursite.com%2Fcart&name=My%20Store">
  Pay with ACBPayWallet
</a>
```

```javascript
function payWithACBPayWallet(amount, orderId) {
  const baseUrl = 'https://qwertymates.com/pay';
  const params = new URLSearchParams({
    merchant: 'YOUR_USER_ID',
    amount: amount.toFixed(2),
    reference: orderId,
    return_url: 'https://yoursite.com/order/complete',
    cancel_url: 'https://yoursite.com/cart',
    name: 'My Store'
  });
  window.location.href = `${baseUrl}?${params}`;
}
```

```php
$payUrl = 'https://qwertymates.com/pay?' . http_build_query([
  'merchant' => 'YOUR_USER_ID',
  'amount' => 99.99,
  'reference' => 'ORDER-' . $orderId,
  'return_url' => 'https://yoursite.com/thanks',
  'cancel_url' => 'https://yoursite.com/cart',
  'name' => 'My Store'
]);
header('Location: ' . $payUrl);
```

---

## Flow

**Embed:**
1. Merchant embeds the iframe on their checkout page.
2. Buyer sees the payment form on the merchant's site.
3. Buyer logs in (if needed) and chooses wallet or card.
4. Payment is processed (card 3DS opens in popup if needed).
5. Embed posts a message to the parent; merchant redirects or shows success.

**Redirect:**
1. Customer clicks "Pay with ACBPayWallet" on your site.
2. They are redirected to the ACBPayWallet payment page.
3. They log in (if needed) and choose wallet or card.
4. Payment is processed.
5. They are redirected back to your `return_url` with status and reference.

## Getting your merchant ID

Your merchant ID is your Qwertymates user ID. Find it in your profile or wallet settings. Visit `/pay/integrate` when logged in to get embed code with your ID pre-filled.
