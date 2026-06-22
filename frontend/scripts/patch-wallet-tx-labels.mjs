import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, '../app/wallet/page.tsx');
let s = fs.readFileSync(pagePath, 'utf8');

if (!s.includes("describeWalletTransaction")) {
  s = s.replace(
    "import { useWalletPaymentSocket } from '@/lib/useWalletPaymentSocket';",
    "import { useWalletPaymentSocket } from '@/lib/useWalletPaymentSocket';\nimport { describeWalletTransaction } from '@/lib/walletTransactionLabel';"
  );
}

if (s.includes('describeWalletTransaction(tx)')) {
  console.log('Already patched');
  process.exit(0);
}

const start = s.indexOf('{transactions.map((tx, idx) => (');
const end = s.indexOf('{tx.orderBreakdown &&', start);
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const replacement = `{transactions.map((tx, idx) => {
                      const txDesc = describeWalletTransaction(tx);
                      return (
                      <motion.div key={tx.reference ? \`\${tx.reference}-\${idx}\` : idx} className="rounded-lg border border-slate-100 bg-white/80 p-4 transition hover:shadow-md">
                        <motion.div className="flex items-center justify-between gap-3">
                          <motion.div className="flex min-w-0 items-center gap-3">
                            <motion.div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
                              {getTransactionIcon(tx.type)}
                            </motion.div>
                            <motion.div className="min-w-0">
                              <p className="font-semibold text-slate-900">
                                {txDesc.href ? (
                                  <Link href={txDesc.href} className="hover:text-sky-600 hover:underline">
                                    {txDesc.title}
                                  </Link>
                                ) : (
                                  txDesc.title
                                )}
                              </p>
                              <p className="text-xs text-slate-600">
                                {new Date(tx.createdAt).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </p>
                              {txDesc.subtitle ? (
                                <p className="text-xs text-slate-400 mt-0.5 truncate" title={tx.reference}>
                                  {txDesc.subtitle}
                                </p>
                              ) : null}
                            </motion.div>
                          </motion.div>
                          <p className={\`shrink-0 font-bold \${getTransactionColor(tx.type)}\`}>
                            {['topup', 'refund', 'credit'].includes(tx.type) ? '+' : '-'}R{Math.abs(tx.amount).toFixed(2)}
                          </p>
                        </motion.div>
`;

// Fix - I used motion.div by mistake in script. Use div only.
const fixed = replacement
  .replaceAll('<motion.div', '<motion.div')
  .replaceAll('</motion.div>', '</motion.div>');

// Actually rewrite with div
const good = `{transactions.map((tx, idx) => {
                      const txDesc = describeWalletTransaction(tx);
                      return (
                      <div key={tx.reference ? \`\${tx.reference}-\${idx}\` : idx} className="rounded-lg border border-slate-100 bg-white/80 p-4 transition hover:shadow-md">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
                              {getTransactionIcon(tx.type)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">
                                {txDesc.href ? (
                                  <Link href={txDesc.href} className="hover:text-sky-600 hover:underline">
                                    {txDesc.title}
                                  </Link>
                                ) : (
                                  txDesc.title
                                )}
                              </p>
                              <p className="text-xs text-slate-600">
                                {new Date(tx.createdAt).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </p>
                              {txDesc.subtitle ? (
                                <p className="text-xs text-slate-400 mt-0.5 truncate" title={tx.reference}>
                                  {txDesc.subtitle}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <p className={\`shrink-0 font-bold \${getTransactionColor(tx.type)}\`}>
                            {['topup', 'refund', 'credit'].includes(tx.type) ? '+' : '-'}R{Math.abs(tx.amount).toFixed(2)}
                          </p>
                        </div>
`;

s = s.slice(0, start) + good + s.slice(end);

// Close map callback: replace `)}` before orderBreakdown - the old was `)}`  after closing div
// After patch, we need `)}`  -> `);})`  - find first `</motion.div>` after our block... 
// Old structure ended with `</div>\n                    ))}`  before orderBreakdown
// We now need closing `</div>\n                    );})}` 

const closeOld = s.indexOf('{tx.orderBreakdown &&', start);
const beforeBreakdown = s.lastIndexOf('</div>', closeOld);
// Find the `))}`  that closed map - should be right before orderBreakdown section's parent
const mapClose = s.indexOf('))}', start);
if (mapClose > 0 && mapClose < closeOld + 200) {
  s = s.slice(0, mapClose) + ');})}' + s.slice(mapClose + 4);
}

fs.writeFileSync(pagePath, s);
console.log('Patched wallet transaction labels');
