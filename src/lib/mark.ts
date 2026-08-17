/** Optically sized PNG masters. Never pick a file from another tier and scale it. */
const MARK_SIZES = [32, 48, 64, 96, 128, 192, 256] as const;

export function nearestMarkSize(size: number): (typeof MARK_SIZES)[number] {
  return MARK_SIZES.reduce((best, n) => (Math.abs(n - size) < Math.abs(best - size) ? n : best));
}

export function markSrc(size: number, base = "/brand"): string {
  return `${base}/earth-${nearestMarkSize(size)}-transparent.png`;
}
