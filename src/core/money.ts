// Money helpers. All money is integer cents. No DOM, no deps.

export function toCents(v: number | string | null | undefined): number {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '')
    .replace(/[^0-9.,-]/g, '')
    .replace(/,(?=\d{3}\b)/g, '')
    .replace(',', '.');
  if (!s || s === '-' || s === '.') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function fmt(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}$${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
export function dollars(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(Math.round(cents));
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
