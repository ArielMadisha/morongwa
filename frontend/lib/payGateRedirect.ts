/**
 * PayWeb3 requires POST to process.trans with PAY_REQUEST_ID + CHECKSUM from initiate.
 * The API may return a signed `paymentUrl` (HTML bridge on our API) or raw `payGateRedirect` fields.
 */
export type PayGateRedirect = {
  processUrl: string;
  payRequestId: string;
  checksum: string;
};

export function openPayGatePayment(payload: {
  paymentUrl?: string | null;
  payGateRedirect?: PayGateRedirect | null;
}): void {
  if (typeof window === 'undefined') return;
  if (payload.paymentUrl) {
    window.location.href = payload.paymentUrl;
    return;
  }
  const r = payload.payGateRedirect;
  if (!r?.processUrl || !r.payRequestId || !r.checksum) return;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = r.processUrl;
  form.setAttribute('accept-charset', 'UTF-8');
  const add = (name: string, value: string) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };
  add('PAY_REQUEST_ID', r.payRequestId);
  add('CHECKSUM', r.checksum);
  document.body.appendChild(form);
  form.submit();
}
