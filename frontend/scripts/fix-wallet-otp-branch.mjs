import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/wallet/page.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const nl = '\r\n';

if (!s.includes('Ask the customer for the 6-digit')) {
  console.log('OTP branch already fixed');
  process.exit(0);
}

const start = s.indexOf(`                    ) : (${nl}                      <>${nl}                        <p className="text-sm text-slate-600">Ask the customer`);
const end = s.indexOf('                    )}', start);
if (start < 0 || end < 0) {
  console.error('block not found', start, end);
  process.exit(1);
}

const replacement = `                    ) : acceptStep === 'waiting' ? (
                      <>
                        <motion.div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                          <Loader2 className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
                          <p className="font-semibold text-amber-900">Waiting for customer to confirm…</p>
                        </div>
                        <button
                          onClick={() => {
                            setAcceptStep('scan');
                            setAcceptPaymentRequestId(null);
                          }}
                          className="rounded-lg border px-3 py-2 text-sm w-full mt-2"
                        >
                          Cancel
                        </button>
                      </>
                    ) : acceptStep === 'done' ? (
                      <>
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center text-emerald-800 font-semibold">
                          Payment received
                        </div>
                        <button
                          onClick={() => {
                            setShowAcceptPayment(false);
                            setAcceptStep('scan');
                            setAcceptPayerId('');
                            setAcceptAmount('');
                            setAcceptPaymentRequestId(null);
                          }}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white w-full"
                        >
                          New payment
                        </button>
                      </>
                    ) : null`.replace(/\n/g, nl).replace('<motion.div', '<motion.div').replace('</motion.div>', '</div>').replace('<motion.div className="rounded-lg bg-amber-50', '<motion.div className="rounded-lg bg-amber-50');

// use div not motion
const replacementFixed = replacement.replace('<motion.div className="rounded-lg bg-amber-50', '<div className="rounded-lg bg-amber-50');

s = s.slice(0, start) + replacementFixed + s.slice(end);

const pin = `                        <input${nl}                          placeholder="Payer ID from QR`;
if (s.includes(pin) && !s.includes('Open camera to scan customer QR')) {
  const scan = `                        {!showMerchantScanner ? (
                          <button
                            type="button"
                            onClick={() => setShowMerchantScanner(true)}
                            className="w-full rounded-lg border-2 border-dashed border-amber-300 py-3 text-sm font-semibold text-amber-800"
                          >
                            Scan customer QR
                          </button>
                        ) : (
                          <WalletQrScanner
                            title="Scan customer QR"
                            onClose={() => setShowMerchantScanner(false)}
                            onScan={(text) => {
                              const id = parseAcbPayUserId(text);
                              if (!id) {
                                toast.error('Not a valid ACBPayWallet QR');
                                return;
                              }
                              setAcceptPayerId(\`ACBPAY:\${id}\`);
                              setShowMerchantScanner(false);
                            }}
                          />
                        )}
`.replace(/\n/g, nl);
  s = s.replace(pin, scan + pin);
}

// Remove dead handleAcceptPaymentStep2 if present
const h2 = `  const handleAcceptPaymentStep2 = async () => {`;
if (s.includes(h2)) {
  const h2start = s.indexOf(h2);
  const h2end = s.indexOf('  };', h2start) + 4;
  s = s.slice(0, h2start) + s.slice(h2end);
}

fs.writeFileSync(filePath, s);
console.log('fixed');
