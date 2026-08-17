/** Transparent 360° loop, seated on a circular bloom instead of a video plate. */
export function EarthSpin({ size = 200 }: { size?: number }) {
  return (
    <div className="earth-stage" style={{ ["--earth-size" as string]: `${size}px` }} aria-hidden="true">
      <div className="earth-stage-bloom" />
      <div className="earth-stage-well" />
      <svg className="earth-stage-rings" viewBox="0 0 100 100">
        <circle className="earth-ring-outer" cx="50" cy="50" r="44.2" />
        <ellipse className="earth-ring-equator" cx="50" cy="50" rx="44.2" ry="13.4" />
      </svg>
      <img
        className="earth-spin-loop"
        src="/motion/earth-spin-transparent.webp"
        width={size}
        height={size}
        alt=""
        decoding="async"
        draggable={false}
      />
      <img
        className="earth-spin-static"
        src="/brand/earth-192-transparent.png"
        width={size}
        height={size}
        alt=""
        draggable={false}
      />
    </div>
  );
}
