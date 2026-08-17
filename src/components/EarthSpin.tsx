/** 360° loop at the size it was drawn (200px). Honour reduced motion with the still mark. */
export function EarthSpin({ size = 200 }: { size?: number }) {
  return (
    <div className="earth-spin" style={{ width: size, height: size }} aria-hidden="true">
      <video className="earth-spin-loop" autoPlay loop muted playsInline width={size} height={size}>
        <source src="/motion/earth-spin.webm" type="video/webm" />
        <source src="/motion/earth-spin.mp4" type="video/mp4" />
      </video>
      <img className="earth-spin-static" src="/brand/earth-192.png" width={size} height={size} alt="" />
    </div>
  );
}
