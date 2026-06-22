'use client';

export type ProductColorOption = {
  name: string;
  hex: string;
  imageIndex: number;
};

type Props = {
  colors: ProductColorOption[];
  selectedName?: string | null;
  onSelect: (color: ProductColorOption) => void;
  disabled?: boolean;
};

export function ProductColorSelector({ colors, selectedName, onSelect, disabled }: Props) {
  if (!colors.length) return null;

  const active = selectedName || colors[0]?.name;

  return (
    <div className="mt-3">
      <p className="text-sm font-medium text-slate-700 mb-2">
        Color{active ? `: ${active}` : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const isSelected = color.name === active;
          return (
            <button
              key={`${color.name}-${color.imageIndex}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(color)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                isSelected
                  ? 'border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-200'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'
              }`}
              aria-pressed={isSelected}
              aria-label={`Select color ${color.name}`}
              title={color.name}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full border border-slate-300/80 shadow-inner"
                style={{ backgroundColor: color.hex }}
                aria-hidden
              />
              <span>{color.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
