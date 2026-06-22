import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../app/wallet/page.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const nl = '\r\n';

if (s.includes('Live store test needs two logins')) {
  console.log('UI already patched');
  process.exit(0);
}

const merchantMarker = '              {/* Accept payment (merchant) */}';
const agentMarker = '              {/* Merchant agent — cash-in / cash-out */}';
const merchantStart = s.indexOf(merchantMarker);
const agentStart = s.indexOf(agentMarker);
if (merchantStart < 0 || agentStart < merchantStart) {
  console.error('markers missing', merchantStart, agentStart);
  process.exit(1);
}

// Drop duplicate bottom merchant UI (top panel replaces it)
s = s.slice(0, merchantStart) + s.slice(agentStart);

const panel = fs
  .readFileSync(path.join(__dirname, 'wallet-merchant-accept-panel.txt'), 'utf8')
  .replace(/\n/g, nl);

const tabsAndBanner = [
  '              {isMerchantWallet ? (',
  '                <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">',
  '                  <button type="button" onClick={() => setWalletView(\'pay\')}',
  '                    className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${walletView === \'pay\' ? \'bg-sky-500 text-white shadow\' : \'text-slate-600 hover:bg-slate-50\'}`}>',
  '                    I&apos;m paying',
  '                  </button>',
  '                  <button type="button" onClick={() => { setWalletView(\'accept\'); setShowAcceptPayment(true); }}',
  '                    className={`flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${walletView === \'accept\' ? \'bg-amber-500 text-white shadow\' : \'text-slate-600 hover:bg-slate-50\'}`}>',
  '                    Accept payment',
  '                  </button>',
  '                </div>',
  '              ) : (',
  '                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">',
  '                  <p className="font-semibold text-amber-950">Live store test needs two logins</p>',
  '                  <p className="mt-1 text-sm text-amber-900">',
  '                    This account is <strong>customer-only</strong>. Use a second login (approved supplier or admin) → wallet → Accept payment → scan this QR.',
  '                  </p>',
  '                  <Link href="/supplier/apply" className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline">Apply as supplier →</Link>',
  '                </div>',
  '              )}',
  '',
  panel,
].join(nl);

const qrAnchor = `              </div>${nl}${nl}              {/* QR code - pay at store */}`;
if (!s.includes(qrAnchor)) {
  console.error('QR anchor missing');
  process.exit(1);
}
s = s.replace(
  qrAnchor,
  `              </div>${nl}${nl}${tabsAndBanner}${nl}              {(!isMerchantWallet || walletView === 'pay') && (${nl}              <>${nl}              {/* QR code - pay at store */}`
);

const p2pEnd = `              </>${nl}              )}${nl}${nl}${agentMarker}`;
if (!s.includes(p2pEnd)) {
  console.error('P2P/agent anchor missing');
  process.exit(1);
}
s = s.replace(p2pEnd, `              </>${nl}              )}${nl}${nl}${agentMarker}`);

fs.writeFileSync(filePath, s);
console.log('patched OK');
