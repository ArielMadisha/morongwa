import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/wallet/page.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const nl = '\r\n';

if (s.includes('Live store test needs two logins')) {
  console.log('already patched');
  process.exit(0);
}

const addImport =
  "import { openPayGatePayment } from '@/lib/payGateRedirect';" +
  nl +
  "import { WalletQrScanner } from '@/components/WalletQrScanner';" +
  nl +
  "import { parseAcbPayUserId } from '@/lib/walletQr';";

if (!s.includes('WalletQrScanner')) {
  s = s.replace(
    "import { openPayGatePayment } from '@/lib/payGateRedirect';",
    addImport
  );
}

if (!s.includes('walletRoles')) {
  s = s.replace(
    '  const [balance, setBalance] = useState(0);',
    `  const [balance, setBalance] = useState(0);${nl}  const [walletRoles, setWalletRoles] = useState({ user: true, merchant: false, runner: false, agent: false });${nl}  const [walletView, setWalletView] = useState<'pay' | 'accept'>('pay');`
  );
}

s = s.replace(
  "  const [acceptOtp, setAcceptOtp] = useState('');",
  "  const [showMerchantScanner, setShowMerchantScanner] = useState(false);"
);
s = s.replace(
  "  const [acceptStep, setAcceptStep] = useState<'scan' | 'otp'>('scan');",
  "  const [acceptStep, setAcceptStep] = useState<'scan' | 'waiting' | 'done'>('scan');"
);

const fetchOld = `      setBalance(balanceRes.data.balance || 0);
      setTransactions(transRes.data || []);
      setMoneyRequests(reqRes.data ?? []);`;
const fetchNew = `      setBalance(balanceRes.data.balance || 0);
      if (balanceRes.data?.walletRoles) {
        setWalletRoles(balanceRes.data.walletRoles);
      }
      setTransactions(transRes.data || []);
      setMoneyRequests(reqRes.data ?? []);`;
if (s.includes(fetchOld)) s = s.replace(fetchOld, fetchNew);

const step1Old = `      const res = await walletAPI.paymentFromScan(payerId, amount, acceptMerchantName.trim() || undefined);
      setAcceptPaymentRequestId(res.data?.paymentRequestId);
      setAcceptStep('otp');
      toast.success('Verification code sent to payer. Ask them for the code.');`;
const step1New = `      const res = await walletAPI.paymentFromScan(
        acceptPayerId.trim().startsWith('ACBPAY:') ? acceptPayerId.trim() : \`ACBPAY:\${payerId}\`,
        amount,
        acceptMerchantName.trim() || undefined
      );
      setAcceptPaymentRequestId(res.data?.paymentRequestId);
      setAcceptStep('waiting');
      toast.success('Waiting for customer to confirm in their wallet');`;
if (s.includes(step1Old)) s = s.replace(step1Old, step1New);

// Poll merchant payment status
const pollBlock = `${nl}  useEffect(() => {${nl}    if (acceptStep !== 'waiting' || !acceptPaymentRequestId) return;${nl}    let cancelled = false;${nl}    const poll = async () => {${nl}      try {${nl}        const res = await walletAPI.getPaymentRequestStatus(acceptPaymentRequestId);${nl}        const st = res.data?.status;${nl}        if (st === 'completed') {${nl}          setAcceptStep('done');${nl}          toast.success('Payment received!');${nl}          fetchWalletData();${nl}          return;${nl}        }${nl}        if (st === 'expired' || st === 'cancelled') {${nl}          toast.error('Payment request expired');${nl}          setAcceptStep('scan');${nl}          setAcceptPaymentRequestId(null);${nl}          return;${nl}        }${nl}      } catch { /* ignore */ }${nl}      if (!cancelled) setTimeout(poll, 2500);${nl}    };${nl}    void poll();${nl}    return () => { cancelled = true; };${nl}  }, [acceptStep, acceptPaymentRequestId]);${nl}`;
if (!s.includes('getPaymentRequestStatus')) {
  s = s.replace('  const handleAcceptPaymentStep1 = async () => {', pollBlock + '  const handleAcceptPaymentStep1 = async () => {');
}

// isMerchantWallet before return
if (!s.includes('isMerchantWallet')) {
  s = s.replace(
    '  return (${nl}    <div className="min-h-screen flex flex-col',
    `  const roleRaw = (user as any)?.role;${nl}  const roles = Array.isArray(roleRaw) ? roleRaw : roleRaw ? [roleRaw] : [];${nl}  const isMerchantWallet = walletRoles.merchant || roles.includes('admin') || roles.includes('superadmin');${nl}${nl}  return (${nl}    <motion.div className="min-h-screen flex flex-col`
  );
  s = s.replace(
    `  return (${nl}    <motion.div className="min-h-screen flex flex-col`,
    `  return (${nl}    <div className="min-h-screen flex flex-col`
  );
}

// Tabs before Accept payment section
const acceptAnchor = `              {/* Accept payment (merchant) */}${nl}              <div className="rounded-2xl border border-white/60`;
const tabs = `              {isMerchantWallet ? (
                <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  <button type="button" onClick={() => setWalletView('pay')} className={\`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold \${walletView === 'pay' ? 'bg-sky-500 text-white' : 'text-slate-600'}\`}>I&apos;m paying</button>
                  <button type="button" onClick={() => { setWalletView('accept'); setShowAcceptPayment(true); }} className={\`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold \${walletView === 'accept' ? 'bg-amber-500 text-white' : 'text-slate-600'}\`}>Accept payment</button>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-semibold text-amber-950">Live store test needs two logins</p>
                  <p className="mt-1 text-sm text-amber-900">Customer: stay here and show your QR. Merchant: second login (approved supplier or admin) → Accept payment → scan this QR.</p>
                  <Link href="/supplier/apply" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline">Apply as supplier →</Link>
                </div>
              )}

              {/* Accept payment (merchant) */}
              {isMerchantWallet && walletView === 'accept' && (
              <div className="rounded-2xl border-2 border-amber-300`;

if (s.includes(acceptAnchor)) {
  s = s.replace(acceptAnchor, tabs);
} else {
  console.error('accept anchor missing');
  process.exit(1);
}

// Update merchant copy and scanner
s = s.replace(
  'Scan customer QR, enter amount, they get SMS code. Enter code to complete.',
  'Scan customer QR → enter amount → they confirm in their wallet (no SMS code).'
);
s = s.replace(
  `{acceptSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Send code to payer'}`,
  `{acceptSubmitting ? <Loader2 className="inline h-4 w-4 animate-spin" /> : 'Request payment'}`
);

// Replace OTP branch with waiting/done
const otpBranchStart = s.indexOf("                    ) : (${nl}                      <>${nl}                        <p className=\"text-sm text-slate-600\">Ask the customer");
if (otpBranchStart > 0) {
  const otpBranchEnd = s.indexOf('                    )}', otpBranchStart);
  const waitingBranch = `                    ) : acceptStep === 'waiting' ? (
                      <>
                        <motion.div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
                          <p className="font-semibold text-amber-900">Waiting for customer to confirm…</p>
                        </div>
                        <button onClick={() => { setAcceptStep('scan'); setAcceptPaymentRequestId(null); }} className="rounded-lg border px-3 py-2 text-sm w-full mt-2">Cancel</button>
                      </>
                    ) : acceptStep === 'done' ? (
                      <>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center text-emerald-800 font-semibold">Payment received</motion.div>
                        <button onClick={() => { setShowAcceptPayment(false); setAcceptStep('scan'); setAcceptPayerId(''); setAcceptAmount(''); setAcceptPaymentRequestId(null); }} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white w-full">New payment</button>
                      </>
                    ) : null}`;
  // fix motion typos in waitingBranch
  const waitingFixed = waitingBranch
    .replace('<motion.div className="rounded-lg bg-amber-50', '<div className="rounded-lg bg-amber-50')
    .replace('Payment received</motion.div>', 'Payment received</div>');
  s = s.slice(0, otpBranchStart) + waitingFixed + s.slice(otpBranchEnd);
}

// Add scanner button before payer input in scan step
const payerInput = `                        <input
                          placeholder="Payer ID from QR (e.g. ACBPAY:...)"`;
const scannerBlock = `                        {!showMerchantScanner ? (
                          <button type="button" onClick={() => setShowMerchantScanner(true)} className="w-full rounded-lg border-2 border-dashed border-amber-300 py-3 text-sm font-semibold text-amber-800">Open camera to scan customer QR</button>
                        ) : (
                          <WalletQrScanner title="Scan customer QR" onClose={() => setShowMerchantScanner(false)} onScan={(text) => {
                            const id = parseAcbPayUserId(text);
                            if (!id) { toast.error('Not a valid ACBPayWallet QR'); return; }
                            setAcceptPayerId(\`ACBPAY:\${id}\`);
                            setShowMerchantScanner(false);
                            toast.success('Customer QR scanned');
                          }} />
                        )}
                        <input
                          placeholder="Payer ID from QR (e.g. ACBPAY:...)"`;
if (s.includes(payerInput) && !s.includes('showMerchantScanner')) {
  s = s.replace(payerInput, scannerBlock);
}

// Close merchant conditional before agent section
const merchantEnd = `              </div>${nl}${nl}              {/* Merchant agent`;
if (s.includes(merchantEnd) && !s.includes('walletView === \'accept\' && (\n              <motion.div')) {
  s = s.replace(
    merchantEnd,
    `              </div>${nl}              )}${nl}${nl}              {/* Merchant agent`
  );
}

// Wrap QR section - insert before QR comment
const qrAnchor = `              {/* QR code - pay at store */}`;
if (!s.includes('{(!isMerchantWallet || walletView')) {
  s = s.replace(qrAnchor, `{(!isMerchantWallet || walletView === 'pay') && (${nl}              <>${nl}              {/* QR code - pay at store */}`);
  s = s.replace(
    `              </div>${nl}${nl}              {/* Request & Receive money */}`,
    `              </div>${nl}              </>${nl}              )}${nl}${nl}              {/* Request & Receive money */}`
  );
}

fs.writeFileSync(filePath, s);
console.log('patched');
