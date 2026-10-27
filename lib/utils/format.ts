export function formatNumber(num: number | null, prefix = "", suffix = ""): string {
  if (num == null) return "—";
  if (num >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B${suffix}`;
  if (num >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M${suffix}`;
  if (num >= 1e3) return `${prefix}${(num / 1e3).toFixed(2)}K${suffix}`;
  return `${prefix}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
}

export function formatPrice(price: number | null): string {
  if (price == null) return "—";
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
