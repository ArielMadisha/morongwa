/** Pre-filled support ticket subject when a user asks for help about a specific product. */
export function buildProductSupportSubject(title: string, productId: string): string {
  const trimmedTitle = title.trim();
  const trimmedId = productId.trim();
  if (!trimmedTitle && !trimmedId) return '';
  if (!trimmedTitle) return `ID: ${trimmedId}`;
  if (!trimmedId) return trimmedTitle;
  return `${trimmedTitle}\nID: ${trimmedId}`;
}

export function buildProductSupportHref(
  title: string,
  productId: string,
  category = 'products:marketplace'
): string {
  const params = new URLSearchParams({
    category,
    subject: buildProductSupportSubject(title, productId),
  });
  return `/support?${params.toString()}`;
}
