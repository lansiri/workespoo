import type { ReactElement } from "react";

/** Inline icons for the kit. All decorative: they are aria-hidden and carry no text. */
export type IconName =
  | "mic" | "keyboard" | "lock" | "speaker" | "pencil" | "circle" | "check" | "minus" | "x" | "clock"
  | "calendar" | "pin" | "briefcase" | "diamond" | "mask" | "info" | "stop" | "menu" | "person" | "building"
  | "arrow" | "external" | "sparkle" | "plus" | "edit" | "mark" | "inbox";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const PATHS: Record<IconName, ReactElement> = {
  mic: (<><rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" {...S} /></>),
  keyboard: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" {...S} /><path d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7.5 14h9" {...S} /></>),
  lock: (<><rect x="5" y="10.5" width="14" height="10" rx="2.5" {...S} /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...S} /></>),
  speaker: (<><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" {...S} /></>),
  pencil: (<><path d="M4 20l1-4L16 5l3 3L8 19z" {...S} /><path d="M14 7l3 3" {...S} /></>),
  circle: <circle cx="12" cy="12" r="7.5" {...S} />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" {...S} strokeWidth={2.4} />,
  minus: <path d="M6 12h12" {...S} strokeWidth={2.4} />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...S} strokeWidth={2.4} />,
  clock: (<><circle cx="12" cy="12" r="8.5" {...S} /><path d="M12 7.5V12l3 2" {...S} /></>),
  calendar: (<><rect x="3.5" y="5" width="17" height="15" rx="3" {...S} /><path d="M3.5 10h17M8 3v4M16 3v4" {...S} /></>),
  pin: (<><path d="M12 21s6.5-5.7 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.3 6.5 11 6.5 11z" {...S} /><circle cx="12" cy="10" r="2.3" {...S} /></>),
  briefcase: (<><rect x="3" y="7.5" width="18" height="12" rx="3" stroke="#0E5E55" fill="none" strokeWidth={2} /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3 13h18" stroke="#0E5E55" fill="none" strokeWidth={2} strokeLinecap="round" /></>),
  diamond: <path d="M12 3l8 9-8 9-8-9z" {...S} />,
  mask: (<><path d="M3.5 8c3-1.5 6-2 8.5-2s5.5.5 8.5 2c0 6-3 10-8.5 10S3.5 14 3.5 8z" {...S} /><path d="M8 11.5h2M14 11.5h2" {...S} /></>),
  info: (<><circle cx="12" cy="12" r="9" {...S} /><path d="M12 11v5.5M12 7.5v.1" {...S} strokeWidth={2.4} /></>),
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" {...S} strokeWidth={2.4} />,
  person: (<><circle cx="12" cy="8" r="3.5" {...S} /><path d="M5 20c.5-4 3.5-6 7-6s6.5 2 7 6" {...S} /></>),
  building: (<><rect x="5" y="3.5" width="14" height="17" rx="2" {...S} /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10 20.5v-4h4v4" {...S} /></>),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" {...S} />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" {...S} />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" />,
  plus: <path d="M12 5v14M5 12h14" {...S} strokeWidth={2.4} />,
  edit: (<><path d="M4 20l1-4L16 5l3 3L8 19z" {...S} /></>),
  mark: <path d="M9 23L20 52L32 33L44 52L55 23" fill="none" stroke="currentColor" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />,
  inbox: <path d="M4 13l2-7h12l2 7v5H4zM4 13h5l1 2h4l1-2h5" {...S} />,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const vb = name === "mark" ? "0 0 64 64" : "0 0 24 24";
  return (
    <svg viewBox={vb} aria-hidden="true" focusable="false" className={className}>
      {PATHS[name]}
    </svg>
  );
}
