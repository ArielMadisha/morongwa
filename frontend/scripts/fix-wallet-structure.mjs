import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../app/wallet/page.tsx');
let s = fs.readFileSync(filePath, 'utf8');
const nl = '\r\n';

// Insert tabs after balance
if (!s.includes('WalletModeTabs')) {
  s = s.replace(
    `              </motion.div>${nl}${nl}{walletView === 'pay'`,
    `              </div>${nl}${nl}              <WalletModeTabs${nl}                mode={walletView}${nl}                showSell={isMerchantWallet}${nl}                onChange={(m) => {${nl}                  setWalletView(m);${nl}                  if (m === 'sell') setShowAcceptPayment(true);${nl}                }}${nl}              />${nl}${nl}{walletView === 'pay'`
  );
  s = s.replace(
    `              </div>${nl}${nl}{walletView === 'pay'`,
    `              </motion.div>${nl}${nl}              <WalletModeTabs${nl}                mode={walletView}${nl}                showSell={isMerchantWallet}${nl}                onChange={(m) => {${nl}                  setWalletView(m);${nl}                  if (m === 'sell') setShowAcceptPayment(true);${nl}                }}${nl}              />${nl}${nl}{walletView === 'pay'`
  );
  // fix accidental motion.div
  s = s.replace('              </motion.div>' + nl + nl + '              <WalletModeTabs', '              </div>' + nl + nl + '              <WalletModeTabs');
}

// Remove duplicate pay fragment opener before P2P
s = s.replace(
  `              </div>${nl}{walletView === 'pay' && (${nl}              <>${nl}              {/* Request & Receive money */}`,
  `              </div>${nl}              {/* Request & Receive money */}`
);

// Wrap cards+topup in pay tab? Skip - keep visible always

// Ensure isMerchantWallet exists
if (!s.includes('const isMerchantWallet')) {
  console.error('missing isMerchantWallet');
}

fs.writeFileSync(filePath, s);
console.log('structure fixed');
