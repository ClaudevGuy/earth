import { markSrc } from "../lib/mark";

export function Mark({ size = 38 }: { size?: number }) {
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
