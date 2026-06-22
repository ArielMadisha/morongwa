import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/wallet/page.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const nl = '\r\n';

s = s.replace(
  `{walletView === 'cash' && (${nl}                            {/* Merchant agent — cash-in / cash-out */}`,
  `{walletView === 'cash' && (${nl}              <>${nl}              {/* Merchant agent — cash-in / cash-out */}`
);

const closeAgent = `              </motion.div>${nl}${nl}              )}${nl}${nl}              {/* Cards - PayGate PayVault */}`;
const closeAgent2 = `              </div>${nl}${nl}              )}${nl}${nl}              {/* Cards - PayGate PayVault */}`;
if (s.includes(closeAgent2) && !s.includes(`</>${nl}              )}${nl}${nl}              {/* Cards`)) {
  s = s.replace(
    closeAgent2,
    `              </div>${nl}              </>${nl}              )}${nl}${nl}              {/* Cards - PayGate PayVault */}`
  );
}

const balGap = `              </div>${nl}${nl}{walletView === 'pay'`;
if (s.includes(balGap) && !s.includes('WalletModeTabs')) {
  s = s.replace(
    balGap,
    `              </div>${nl}${nl}              <WalletModeTabs${nl}                mode={walletView}${nl}                showSell={isMerchantWallet}${nl}                onChange={(m) => {${nl}                  setWalletView(m);${nl}                  if (m === 'sell') setShowAcceptPayment(true);${nl}                }}${nl}              />${nl}${nl}{walletView === 'pay'`
  );
}

// suppliersAPI import
if (!s.includes('suppliersAPI')) {
  s = s.replace(
    "import { paymentsAPI, walletAPI } from '@/lib/api';",
    "import { paymentsAPI, walletAPI, suppliersAPI } from '@/lib/api';"
  );
}

fs.writeFileSync(filePath, s);
console.log('jsx fixed');
