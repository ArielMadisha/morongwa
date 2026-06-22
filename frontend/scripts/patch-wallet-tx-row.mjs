import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/wallet/page.tsx');
let s = fs.readFileSync(pagePath, 'utf8');

if (!s.includes('WalletTransactionRow')) {
  s = s.replace(
    "import { describeWalletTransaction } from '@/lib/walletTransactionLabel';",
    "import { WalletTransactionRow } from '@/components/wallet/WalletTransactionRow';"
  );
}

const start = s.indexOf('{transactions.map((tx, idx) => (');
const end = s.indexOf('                    ))}', start);
if (start < 0 || end < 0) {
  console.error('block not found', start, end);
  process.exit(1);
}

const replacement = `{transactions.map((tx, idx) => (
                      <WalletTransactionRow
                        key={tx.reference ? \`\${tx.reference}-\${idx}\` : idx}
                        tx={tx}
                        icon={getTransactionIcon(tx.type)}
                        amountClassName={getTransactionColor(tx.type)}
                        amountPrefix={['topup', 'refund', 'credit'].includes(tx.type) ? '+' : '-'}
                      />
                    ))}`;

s = s.slice(0, start) + replacement + s.slice(end + '                    ))}'.length);
fs.writeFileSync(pagePath, s);
console.log('done');
