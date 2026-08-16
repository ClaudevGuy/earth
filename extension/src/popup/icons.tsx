import type { ReactNode } from "react";

function Svg({
  children,
  size = 22,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconHome() {
  return (
    <Svg>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" />
    </Svg>
  );
}

export function IconClock() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </Svg>
  );
}

export function IconGrid() {
  return (
    <Svg>
      <rect x="4" y="4" width="6" height="6" rx="1.2" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" />
    </Svg>
  );
}

export function IconGear() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.9 6.3l1.6 1.6M17.5 16.1l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.7l1.6-1.6M17.5 7.9l1.6-1.6" />
    </Svg>
  );
}

export function IconSend() {
  return (
    <Svg size={20}>
      <path d="M5 19 19 5M19 5h-8M19 5v8" />
    </Svg>
  );
}

export function IconReceive() {
  return (
    <Svg size={20}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </Svg>
  );
}

export function IconCopy() {
  return (
    <Svg size={18}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 16V5a2 2 0 0 1 2-2h11" />
    </Svg>
  );
}

export function IconLock() {
  return (
    <Svg size={18}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconEye({ off }: { off?: boolean }) {
  return (
    <Svg size={18}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.5" />
      {off ? <path d="M4 20 20 4" /> : null}
    </Svg>
  );
}

export function IconBack() {
  return (
    <Svg size={18}>
      <path d="M15 5 8 12l7 7" />
    </Svg>
  );
}

export function IconCheck() {
  return (
    <Svg size={18}>
      <path d="M5 12.5 9.5 17 19 7" />
    </Svg>
  );
}
