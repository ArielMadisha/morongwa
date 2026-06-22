import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/wallet/page.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const nl = '\r\n';

// imports
if (!s.includes('WalletModeTabs')) {
  s = s.replace(
    "import { parseAcbPayUserId } from '@/lib/walletQr';",
    "import { parseAcbPayUserId } from '@/lib/walletQr';" +
      nl +
      "import { WalletModeTabs, type WalletMode } from '@/components/wallet/WalletModeTabs';" +
      nl +
      "import { suppliersAPI } from '@/lib/api';"
  );
  // suppliersAPI already exported from api - merge import line
  s = s.replace(
    "import { paymentsAPI, walletAPI } from '@/lib/api';",
    "import { paymentsAPI, walletAPI, suppliersAPI } from '@/lib/api';"
  );
  s = s.replace(nl + "import { suppliersAPI } from '@/lib/api';", '');
}

s = s.replace(
  "const [walletView, setWalletView] = useState<'pay' | 'accept'>('pay');",
  "const [walletView, setWalletView] = useState<WalletMode>('pay');"
);

if (!s.includes('maDepositCustomerId')) {
  s = s.replace(
    '  const [maDepositUser, setMaDepositUser] = useState(\'\');',
    '  const [maDepositUser, setMaDepositUser] = useState(\'\');' +
      nl +
      '  const [maDepositCustomerId, setMaDepositCustomerId] = useState(\'\');' +
      nl +
      '  const [showAgentDepositScanner, setShowAgentDepositScanner] = useState(false);'
  );
}

// default store name
if (!s.includes('setAcceptMerchantName(sn)')) {
  s = s.replace(
    '  useEffect(() => {' + nl + '    fetchWalletData();' + nl + '  }, []);',
    `  useEffect(() => {${nl}    fetchWalletData();${nl}  }, []);${nl}${nl}  useEffect(() => {${nl}    if (!user) return;${nl}  suppliersAPI${nl}      .getMe()${nl}      .then((res) => {${nl}        const sn = (res.data as { data?: { storeName?: string } })?.data?.storeName;${nl}        if (sn?.trim()) setAcceptMerchantName(sn.trim());${nl}      })${nl}      .catch(() => {});${nl}  }, [user]);${nl}${nl}  useEffect(() => {${nl}    if (maBusinessName?.trim() && !acceptMerchantName.trim()) {${nl}      setAcceptMerchantName(maBusinessName.trim());${nl}    }${nl}  }, [maBusinessName]);`
  );
}

// URL ?accept=1 -> sell
if (!s.includes("searchParams.get('accept')")) {
  s = s.replace(
    '  useEffect(() => {' + nl + '    const load = async () => {',
    `  useEffect(() => {${nl}    const wantSell = searchParams.get('accept') === '1' || searchParams.get('merchant') === '1';${nl}    if (wantSell && walletRoles.merchant) {${nl}      setWalletView('sell');${nl}      setShowAcceptPayment(true);${nl}    }${nl}  }, [searchParams, walletRoles.merchant]);${nl}${nl}  useEffect(() => {${nl}    const load = async () => {`
  );
}

// isMerchantWallet before return
if (!s.includes('const isMerchantWallet')) {
  s = s.replace(
    '  return (' + nl + '    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50',
    `  const roleRaw = (user as { role?: string | string[] })?.role;${nl}  const roles = Array.isArray(roleRaw) ? roleRaw : roleRaw ? [roleRaw] : [];${nl}  const isMerchantWallet = walletRoles.merchant || roles.includes('admin') || roles.includes('superadmin');${nl}  const isAgentWallet = walletRoles.agent || maIsApproved;${nl}${nl}  return (${nl}    <div className="min-h-screen flex flex-col bg-gradient-to-br from-sky-50`
  );
}

// fix handleAcceptPaymentStep1
s = s.replace(
  `      const res = await walletAPI.paymentFromScan(payerId, amount, acceptMerchantName.trim() || undefined);
      setAcceptPaymentRequestId(res.data?.paymentRequestId);
      setAcceptStep('otp');
      toast.success('Verification code sent to payer. Ask them for the code.');`,
  `      const fromRaw = acceptPayerId.trim().startsWith('ACBPAY:') ? acceptPayerId.trim() : \`ACBPAY:\${payerId}\`;
      const storeLabel = acceptMerchantName.trim() || (user as { name?: string })?.name || 'Store';
      const res = await walletAPI.paymentFromScan(fromRaw, amount, storeLabel);
      setAcceptPaymentRequestId(res.data?.paymentRequestId);
      setAcceptStep('waiting');
      toast.success('Waiting for customer to confirm in their wallet');`
);

// tabs after balance
const balanceEnd =
  `                <p className="mt-3 text-sm opacity-80">Keep it topped up for seamless task payouts.</p>${nl}              </div>${nl}${nl}`;
const tabsInsert = `                <p className="mt-3 text-sm opacity-80">Keep it topped up for seamless task payouts.</p>${nl}              </div>${nl}${nl}              <WalletModeTabs${nl}                mode={walletView}${nl}                showSell={isMerchantWallet}${nl}                onChange={(m) => {${nl}                  setWalletView(m);${nl}                  if (m === 'sell') setShowAcceptPayment(true);${nl}                }}${nl}              />${nl}${nl}`;
if (s.includes(balanceEnd) && !s.includes('WalletModeTabs')) {
  s = s.replace(balanceEnd, tabsInsert);
}

// pay view condition
s = s.replace(
  "{(!isMerchantWallet || walletView === 'pay') && (",
  "{walletView === 'pay' && ("
);

// wrap P2P in pay - add opening before Request & Receive if not wrapped
const p2pStart = `              {/* Request & Receive money */}`;
if (s.includes(p2pStart) && !s.includes('{walletView === \'pay\' && (\n              <>\n              {/* Request')) {
  // P2P already after pay close - wrap it
  s = s.replace(
    `              </>${nl}              )}${nl}${nl}              {/* Request & Receive money */}`,
    `              {/* Request & Receive money */}`
  );
  // wrong approach - wrap P2P block with pay condition
}

// Remove old 2-tab block
const oldTabs = `              {isMerchantWallet ? (
                <motion.div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
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
              {isMerchantWallet && walletView === 'accept' && (`;
// fix motion typo in pattern - use actual file content
const oldTabs2 =
  `              {isMerchantWallet ? (${nl}                <motion.div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">`;
if (s.includes(`walletView === 'accept'`)) {
  s = s.replace(/walletView === 'accept'/g, "walletView === 'sell'");
}
const oldBlockStart = `              {isMerchantWallet ? (${nl}                <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">`;
if (s.includes(oldBlockStart)) {
  const start = s.indexOf(oldBlockStart);
  const sellStart = s.indexOf('              {/* Accept payment (merchant) */}', start);
  if (start >= 0 && sellStart > start) {
    s = s.slice(0, start) + s.slice(sellStart);
  }
}

s = s.replace(
  `{isMerchantWallet && walletView === 'sell' && (`,
  `{walletView === 'sell' && isMerchantWallet && (`
);

// non-merchant sell tab hint - when they somehow need supplier
if (!s.includes('Apply as supplier to use Sell')) {
  s = s.replace(
    `{walletView === 'sell' && isMerchantWallet && (`,
    `{walletView === 'sell' && !isMerchantWallet && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-amber-950">Tuckshop / store owner?</p>
                <p className="mt-1 text-sm text-amber-900">Apply as an approved supplier to accept QR payments at your till (Phase 1: enter total after basket).</p>
                <Link href="/supplier/apply" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline">Apply as supplier →</Link>
              </motion.div>
              )}

              {walletView === 'sell' && isMerchantWallet && (`
  );
  s = s.replace('              </motion.div>', '              </div>', 1);
}

// wrap merchant agent in cash tab
const agentComment = `              {/* Merchant agent — cash-in / cash-out */}`;
if (s.includes(agentComment) && !s.includes("{walletView === 'cash' && (")) {
  s = s.replace(agentComment, `{walletView === 'cash' && (${nl}              ${agentComment}`);
  // close before Cards section
  const cardsComment = `              {/* Cards - PayGate PayVault */}`;
  const ci = s.indexOf(cardsComment);
  if (ci > 0) {
    s = s.slice(0, ci) + `              )}${nl}${nl}` + s.slice(ci);
  }
}

// wrap P2P in pay
if (s.includes(p2pStart) && !s.includes('walletView === \'pay\' && (\n              <>\n              {/* Request & Receive')) {
  s = s.replace(
    p2pStart,
    `{walletView === 'pay' && (${nl}              <>${nl}              ${p2pStart.replace('              ', '')}`
  );
  // close P2P before sell section
  s = s.replace(
    `              </div>${nl}${nl}              {/* Accept payment (merchant) */}`,
    `              </div>${nl}              </>${nl}              )}${nl}${nl}              {/* Accept payment (merchant) */}`
  );
}

// store name label
s = s.replace(
  'placeholder="Store name (optional)"',
  'placeholder="Store name shown to buyer (e.g. Mama\'s Tuckshop)"'
);

// agent deposit QR
if (!s.includes('showAgentDepositScanner')) {
  // already added state
}
const agentDepositTitle = `                    <p className="text-sm font-semibold text-slate-900 mb-2">Agent: record cash deposit</p>`;
if (s.includes(agentDepositTitle) && !s.includes('showAgentDepositScanner')) {
  const insertScan = `                        {!showAgentDepositScanner ? (
                          <button
                            type="button"
                            onClick={() => setShowAgentDepositScanner(true)}
                            className="w-full rounded-lg border-2 border-dashed border-sky-300 py-2 text-sm font-semibold text-sky-700 mb-2"
                          >
                            Scan customer QR
                          </button>
                        ) : (
                          <WalletQrScanner
                            title="Scan customer QR"
                            onClose={() => setShowAgentDepositScanner(false)}
                            onScan={(text) => {
                              const id = parseAcbPayUserId(text);
                              if (!id) {
                                toast.error('Not a valid ACBPayWallet QR');
                                return;
                              }
                              setMaDepositCustomerId(id);
                              setShowAgentDepositScanner(false);
                              toast.success('Customer scanned');
                            }}
                          />
                        )}
`;
  s = s.replace(
    `                    <p className="text-xs text-slate-600 mb-3">Customer paid you cash — enter their username and amount. They get an SMS to approve crediting their wallet (moves float from your wallet). You must have enough balance.</p>`,
    `                    <p className="text-xs text-slate-600 mb-3">Customer gave you cash — scan their wallet QR or enter username. They approve in the app (WhatsApp/SMS link). Requires agent wallet float.</p>${nl}${insertScan}`
  );
  s = s.replace(
    `                          await walletAPI.initiateAgentDeposit({
                            customerUsername: maDepositUser.trim(),
                            amount,
                          });`,
    `                          const cid = maDepositCustomerId.trim() || parseAcbPayUserId(maDepositUser.trim());
                          await walletAPI.initiateAgentDeposit({
                            ...(cid && /^[a-f0-9]{24}$/i.test(cid)
                              ? { customerUserId: cid }
                              : { customerUsername: maDepositUser.trim() }),
                            amount,
                          });`
  );
}

// PDF text
s = s.replace(
  'Show this at checkout. Store scans → you get SMS code → tell the teller.',
  'Show this at checkout. Merchant scans → you confirm in your wallet.'
);

// withdraw title align WA
s = s.replace(
  '<p className="text-sm font-semibold text-slate-900 mb-2">Withdraw: get cash from an agent</p>',
  '<p className="text-sm font-semibold text-slate-900 mb-2">Get cash from an agent</p>'
);

fs.writeFileSync(filePath, s);
console.log('wallet page aligned');
