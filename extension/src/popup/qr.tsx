import { encode } from "uqr";

export function AddressQr({ value }: { value: string }) {
  const { data } = encode(value);
  const n = data.length;
  return (
    <svg className="qr" viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" aria-label="Address QR code">
      {data.map((row, y) =>
        row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)),
      )}
    </svg>
  );
}
