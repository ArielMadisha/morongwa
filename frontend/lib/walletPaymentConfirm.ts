/** Apple Pay–style confirmation: platform biometrics when available, else one-tap confirm. */

function walletRpId(): string {
  if (typeof window === 'undefined') return 'localhost';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return host;
  return host.replace(/^www\./, '');
}

async function tryPlatformBiometric(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    const uvpa = PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
    if (uvpa && !(await uvpa)) return false;

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: walletRpId(),
        userVerification: 'required',
        timeout: 120_000,
      },
    });
    return !!cred;
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === 'NotAllowedError' || name === 'AbortError') return false;
    return false;
  }
}

export type WalletPaymentConfirmParams = {
  amount: number;
  counterpartyName: string;
  actionLabel?: string;
};

/**
 * Prompt user to authorize a wallet payment. Returns true if authorized.
 * Uses device biometrics when the browser supports it; otherwise a confirm dialog.
 */
export async function confirmWalletPayment(params: WalletPaymentConfirmParams): Promise<boolean> {
  const { amount, counterpartyName, actionLabel = 'Pay' } = params;
  const amountText = `R${amount.toFixed(2)}`;
  const bioOk = await tryPlatformBiometric();
  if (bioOk) return true;
  return window.confirm(`${actionLabel} ${amountText} to ${counterpartyName}?`);
}
