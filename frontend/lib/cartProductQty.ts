/** Build productId → qty map from GET /cart response (excludes music items). */
export function productQtyMapFromCartResponse(
  res: { data?: { data?: { items?: unknown[] } } },
  opts?: { productId?: string; selectedColor?: string | null; selectedSize?: string | null }
): Record<string, number> {
  const items = Array.isArray(res.data?.data?.items) ? res.data!.data!.items! : [];
  const m: Record<string, number> = {};
  const wantPid = opts?.productId ? String(opts.productId) : '';
  const wantColor = (opts?.selectedColor || '').trim().toLowerCase();
  const wantSize = (opts?.selectedSize || '').trim().toUpperCase().replace(/\s+/g, '');
  for (const it of items) {
    const row = it as {
      type?: string;
      songId?: unknown;
      productId?: { _id?: string } | string;
      product?: { _id?: string };
      qty?: number;
      selectedColor?: string;
      selectedSize?: string;
    };
    if (row.type === 'music' || row.songId) continue;
    const pid = String(row.product?._id ?? (row.productId as { _id?: string } | undefined)?._id ?? row.productId ?? '');
    if (!pid) continue;
    if (wantPid && pid !== wantPid) continue;
    if (wantPid && wantColor) {
      const lineColor = (row.selectedColor || '').trim().toLowerCase();
      if (lineColor !== wantColor) continue;
    }
    if (wantPid && wantSize) {
      const lineSize = (row.selectedSize || '').trim().toUpperCase().replace(/\s+/g, '');
      if (lineSize !== wantSize) continue;
    }
    const key = wantPid && (wantColor || wantSize) ? pid : pid;
    m[key] = Number(row.qty ?? 0);
  }
  return m;
}
