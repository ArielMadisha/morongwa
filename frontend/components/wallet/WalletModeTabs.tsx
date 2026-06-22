'use client';

export type WalletMode = 'pay' | 'cash' | 'sell';

type Props = {
  mode: WalletMode;
  onChange: (mode: WalletMode) => void;
  showSell: boolean;
};

export function WalletModeTabs({ mode, onChange, showSell }: Props) {
  const tabClass = (active: boolean, accent: 'sky' | 'emerald' | 'amber') => {
    if (!active) return 'flex-1 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-50';
    if (accent === 'emerald') return 'flex-1 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold bg-emerald-600 text-white shadow';
    if (accent === 'amber') return 'flex-1 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold bg-amber-500 text-white shadow';
    return 'flex-1 rounded-lg px-2 py-2.5 text-xs sm:text-sm font-semibold bg-sky-500 text-white shadow';
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button type="button" onClick={() => onChange('pay')} className={tabClass(mode === 'pay', 'sky')}>
          Pay at shop
        </button>
        <button type="button" onClick={() => onChange('cash')} className={tabClass(mode === 'cash', 'emerald')}>
          Cash & agents
        </button>
        {showSell && (
          <button
            type="button"
            onClick={() => onChange('sell')}
            className={tabClass(mode === 'sell', 'amber')}
          >
            Sell (till)
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 text-center">
        {mode === 'pay' && 'Show your QR when a tuckshop totals your basket — same flow as WhatsApp wallet QR.'}
        {mode === 'cash' && 'Get physical cash from agents, or approve wallet top-ups when you paid cash — WhatsApp wallet option 3.'}
        {mode === 'sell' && 'Scan the buyer’s QR, enter the total (e.g. tomatoes R47) — they confirm once in the app.'}
      </p>
    </div>
  );
}
