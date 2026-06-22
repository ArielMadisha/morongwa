'use client';

type Props = {
  sizes: string[];
  selectedSize?: string | null;
  onSelect: (size: string) => void;
  disabled?: boolean;
};

export function ProductSizeSelector({ sizes, selectedSize, onSelect, disabled }: Props) {
  if (!sizes.length) return null;

  const active = selectedSize || sizes[0];

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-slate-700 mb-2">
        Size{active ? `: ${active}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const isSelected = size === active;
          return (
            <button
              key={size}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(size)}
              className={`inline-flex min-w-[2.5rem] items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                isSelected
                  ? 'border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'
              }`}
              aria-pressed={isSelected}
              aria-label={`Select size ${size}`}
            >
              {size}
            </button>
          );
        })}
      </div>
    </div>
  );
}
