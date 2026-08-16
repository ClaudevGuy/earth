export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="earthFill" cx="34%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#9bb892" />
          <stop offset="42%" stopColor="#4a828a" />
          <stop offset="100%" stopColor="#1c3a3e" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="16" fill="url(#earthFill)" />
      <circle cx="20" cy="20" r="16.6" stroke="#e09245" strokeWidth="1.15" opacity="0.9" />
      <ellipse cx="20" cy="20" rx="6.4" ry="16" stroke="#f0e2c8" strokeWidth="0.7" opacity="0.28" />
      <path
        d="M4 20h32M20 4c5.6 6.1 8.2 12 8.2 16S25.6 29.9 20 36c-5.6-6.1-8.2-12-8.2-16S14.4 10.1 20 4z"
        stroke="#e4f4f1"
        strokeWidth="0.75"
        opacity="0.4"
      />
    </svg>
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
  return (
    <span
      className="token-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: `linear-gradient(145deg, ${from}, ${to})`,
      }}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}
