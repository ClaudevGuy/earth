import type { Page } from "../types";

/** Fixed topographic field — latitude ridges and a distant meridian, never intercepts clicks. */
export function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <svg className="atmosphere-ridges" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice">
        <g fill="none" strokeLinecap="round">
          <path className="ridge ochre" d="M-40 70 C 180 20, 360 120, 560 64 S 940 20, 1240 88" />
          <path className="ridge ocean" d="M-40 148 C 200 210, 420 110, 640 168 S 980 220, 1240 140" />
          <path className="ridge moss" d="M-40 248 C 160 200, 380 300, 620 236 S 980 190, 1240 270" />
          <path className="ridge ochre" d="M-40 360 C 220 410, 440 310, 680 372 S 1020 430, 1240 340" />
          <path className="ridge ocean" d="M-40 490 C 180 440, 400 560, 660 500 S 1000 440, 1240 530" />
          <path className="ridge moss" d="M-40 640 C 240 700, 460 580, 720 650 S 1040 720, 1240 610" />
          <path className="ridge ochre" d="M-40 790 C 200 740, 430 860, 700 780 S 1020 740, 1240 820" />
        </g>
        <g className="atmosphere-meridian" fill="none">
          <ellipse cx="980" cy="120" rx="280" ry="280" />
          <ellipse cx="980" cy="120" rx="280" ry="86" />
          <path d="M980 -160 V 400" />
        </g>
      </svg>
    </div>
  );
}

const PATH_MOTIFS: Record<string, { label: string; d: string }> = {
  standards: {
    label: "meridians",
    d: "M18 3.5A14.5 14.5 0 1 1 18 32.5A14.5 14.5 0 1 1 18 3.5ZM3.5 18h29M18 3.5c4 5.8 6 9.8 6 14.5s-2 8.7-6 14.5M18 3.5c-4 5.8-6 9.8-6 14.5s2 8.7 6 14.5",
  },
  launchpad: {
    label: "ridge",
    d: "M3 26.5c4.2-1.2 7.4-6.8 11.2-6.8 3.2 0 4.6 4.6 8.1 4.6 3.8 0 6.4-5.2 10.7-4.2M3 21c5-6.4 8.6-12.6 15-14.5 4.4 4.2 7.2 9.4 15 12.8",
  },
  dex: {
    label: "orbits",
    d: "M18 6.5a11.5 11.5 0 1 1 0 23 11.5 11.5 0 1 1 0-23ZM4 18h28M18 4.5c3.6 4.8 5.4 8.4 5.4 13.5S21.6 26.7 18 31.5M18 4.5C14.4 9.3 12.6 12.9 12.6 18S14.4 26.7 18 31.5",
  },
  trade: {
    label: "scan",
    d: "M4 10.5h28M4 18h28M4 25.5h28M7.5 6.5c6 3.2 14.8 3.2 21 0M7.5 29.5c6-3.2 14.8-3.2 21 0",
  },
};

export function PathMotif({ page }: { page: Page }) {
  const motif = PATH_MOTIFS[page] ?? PATH_MOTIFS.dex!;
  return (
    <svg className="path-motif" viewBox="0 0 36 36" aria-hidden="true">
      <title>{motif.label}</title>
      <path d={motif.d} />
    </svg>
  );
}
