import { markSrc } from "../lib/mark";

const PALETTES: [string, string][] = [
  ["#4a828a", "#7ea37a"],
  ["#e09245", "#c45c3a"],
  ["#7ea37a", "#c9d7b0"],
  ["#3e6f76", "#d7ece8"],
  ["#c45c3a", "#ead9bd"],
  ["#8a6b4a", "#d4843c"],
  ["#5c7a62", "#ead9bd"],
  ["#6b5344", "#e09245"],
];

function paletteFor(symbol: string): [string, string] {
  if (symbol === "SOL" || symbol === "wSOL") return ["#4a828a", "#7ea37a"];
  if (symbol === "USDC") return ["#3e6f76", "#d7ece8"];
  if (symbol === "USDT") return ["#7ea37a", "#c9d7b0"];
  let n = 0;
  for (let i = 0; i < symbol.length; i++) n = (n * 33 + symbol.charCodeAt(i)) >>> 0;
  return PALETTES[n % PALETTES.length]!;
}

export function TokenAvatar({
  symbol,
  size = 32,
  logo,
}: {
  symbol: string;
  size?: number;
  logo?: string;
}) {
  const [from, to] = paletteFor(symbol);
  const src = logo || (symbol === "EARTH" ? markSrc(size) : undefined);
  if (src) {
    return (
      <span
        className="token-avatar"
        style={{ width: size, height: size, background: `linear-gradient(145deg, ${from}, ${to})` }}
        aria-hidden="true"
      >
        <img src={src} alt="" />
      </span>
    );
  }
  return (
    <span
      className="token-avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.38),
        background: `linear-gradient(145deg, ${from}, ${to})`,
      }}
      aria-hidden="true"
    >
      {symbol.slice(0, 1).toUpperCase()}
    </span>
  );
}
