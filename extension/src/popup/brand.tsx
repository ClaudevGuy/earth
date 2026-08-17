const MARK_SIZES = [32, 48, 64] as const;

function markSrc(size: number): string {
  const pick = MARK_SIZES.reduce((best, n) => (Math.abs(n - size) < Math.abs(best - size) ? n : best));
  return `icons/earth-${pick}-transparent.png`;
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src={markSrc(size)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      aria-hidden="true"
    />
  );
}

const PALETTES: [string, string][] = [
  ["#4a828a", "#7ea37a"],
  ["#e09245", "#c45c3a"],
  ["#7ea37a", "#c9d7b0"],
  ["#3e6f76", "#d7ece8"],
  ["#c45c3a", "#ead9bd"],
];

export function TokenAvatar({ symbol, size = 28 }: { symbol: string; size?: number }) {
  let n = 0;
  for (let i = 0; i < symbol.length; i++) n = (n * 33 + symbol.charCodeAt(i)) >>> 0;
  const [from, to] = symbol === "SOL" ? ["#4a828a", "#7ea37a"] : PALETTES[n % PALETTES.length]!;
  const earth = symbol === "EARTH";
  return (
    <span
      className="token-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: earth ? "#0e0b09" : `linear-gradient(145deg, ${from}, ${to})`,
      }}
    >
      {earth ? (
        <img src={markSrc(size)} alt="" width={size} height={size} />
      ) : (
        symbol.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
