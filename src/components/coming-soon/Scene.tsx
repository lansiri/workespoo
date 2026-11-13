import type { ComingSoonStrings } from "./messages";
import "./coming-soon.css";

/* Hand-written SVG illustration. Every visible word comes from `messages.ts`. */

const PINE = "#0E5E55";
const SUN = "#FFB627";
const CREAM = "#FBF7F0";
const PAPER = "#FFFDF8";
const INK = "#1E2B29";
const MINT = "#5ED1B6";
const NIGHT = "#14211F";
const CORAL = "#F0603A";
const STAMP = "#B3361A"; // darkened coral: the only red used for text

/** Splits a message on "\n" into centred tspans. */
function Lines({ text, x, y, lh }: { text: string; x: number; y: number; lh: number }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <tspan key={i} x={x} y={y + i * lh}>
          {line}
        </tspan>
      ))}
    </>
  );
}

function burstPoints(cx: number, cy: number, outer: number, inner: number, spikes: number): string {
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** CV-O-MATIC 3000: reads a CV for six seconds, stamps REJECTED. */
export function CvRobot({ m }: { m: ComingSoonStrings }) {
  return (
    <svg
      viewBox="-40 -10 440 390"
      preserveAspectRatio="xMidYMin slice"
      className="cs-robotSvg"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="200" cy="370" rx="170" ry="9" fill={INK} opacity="0.14" />
      {/* CVs being fed in from the left */}
      <g className="cs-cvFly1">
        <rect x="-36" y="96" width="34" height="44" rx="3" fill={PAPER} stroke={INK} strokeWidth="3" />
        <path d="M-29 108h20M-29 117h20M-29 126h12" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="cs-cvFly2">
        <rect x="-36" y="96" width="34" height="44" rx="3" fill={PAPER} stroke={INK} strokeWidth="3" />
        <path d="M-29 108h20M-29 117h20M-29 126h12" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <g className="cs-cvFly3">
        <rect x="-36" y="96" width="34" height="44" rx="3" fill={PAPER} stroke={INK} strokeWidth="3" />
        <path d="M-29 108h20M-29 117h20M-29 126h12" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* treads */}
      <rect x="64" y="330" width="272" height="36" rx="18" fill={INK} />
      {[96, 150, 204, 258, 304].map((cx) => (
        <circle key={cx} cx={cx} cy="348" r="9" fill={CREAM} opacity="0.85" />
      ))}
      {/* body */}
      <g className="cs-robotBody">
        <rect x="70" y="196" width="260" height="140" rx="26" fill={PINE} stroke={INK} strokeWidth="6" />
        <g transform="rotate(-4 160 220)">
          <rect x="86" y="206" width="160" height="34" rx="9" fill={SUN} stroke={INK} strokeWidth="3.5" />
          <text x="166" y="230" textAnchor="middle" className="cs-brandText" fontSize="21" fill={INK} letterSpacing="1.5">
            {m.botSticker}
          </text>
        </g>
        <text x="90" y="262" className="cs-sansText" fontSize="15" fontWeight="600" fill={CREAM}>
          {m.botFine}
        </text>
        <g className="cs-stamp">
          <g transform="rotate(-7 200 296)">
            <rect x="92" y="272" width="216" height="50" rx="8" fill={PAPER} stroke={STAMP} strokeWidth="5" />
            <text x="200" y="309" textAnchor="middle" className="cs-brandText" fontSize="32" fill={STAMP} letterSpacing="2">
              {m.stamp}
            </text>
          </g>
        </g>
      </g>
      {/* head */}
      <rect x="24" y="24" width="352" height="176" rx="34" fill={PAPER} stroke={INK} strokeWidth="6" />
      <circle cx="24" cy="112" r="11" fill={SUN} stroke={INK} strokeWidth="4" />
      <text x="168" y="62" textAnchor="middle" className="cs-brandText" fontSize="23" fill={INK}>
        {m.botName}
      </text>
      <rect x="46" y="76" width="308" height="100" rx="16" fill={NIGHT} />
      <text x="62" y="108" className="cs-monoText" fontSize="19" fontWeight="700" fill={MINT}>
        {m.botCode1}
      </text>
      <text x="62" y="136" className="cs-monoText" fontSize="19" fontWeight="700" fill={MINT}>
        {m.botCode2}
        <tspan className="cs-cursor"> _</tspan>
      </text>
      <text x="62" y="163" className="cs-sansText" fontSize="15" fontWeight="600" fill={SUN}>
        {m.botRead}
      </text>
      {/* NOPE sticker */}
      <g transform="rotate(8 312 168)">
        <rect x="262" y="148" width="100" height="40" rx="8" fill={PAPER} stroke={STAMP} strokeWidth="4" />
        <text x="312" y="177" textAnchor="middle" className="cs-brandText" fontSize="24" fill={STAMP}>
          {m.botNope}
        </text>
      </g>
      {/* stopwatch */}
      <rect x="318" y="-8" width="22" height="14" rx="4" fill={INK} />
      <circle cx="329" cy="44" r="44" fill={PAPER} stroke={INK} strokeWidth="6" />
      <circle cx="329" cy="44" r="35" fill="none" stroke={SUN} strokeWidth="7" strokeDasharray="220" className="cs-watchRing" transform="rotate(-90 329 44)" />
      <text x="329" y="54" textAnchor="middle" className="cs-brandText" fontSize="29" fill={INK}>
        {m.botStopwatch}
      </text>
    </svg>
  );
}

/** The Cheer W mascot, arms up, with the LUL burst and the opening question. */
export function CheerMascot({ m }: { m: ComingSoonStrings }) {
  return (
    <svg viewBox="0 0 340 420" className="cs-mascotSvg" aria-hidden="true" focusable="false">
      <ellipse cx="170" cy="392" rx="105" ry="9" fill={INK} opacity="0.14" />
      {/* speech bubble */}
      <g className="cs-bubble">
        <path
          d="M30 6h280a24 24 0 0 1 24 24v44a24 24 0 0 1-24 24H196l-26 34-26-34H30A24 24 0 0 1 6 74V30A24 24 0 0 1 30 6z"
          fill={PAPER}
          stroke={INK}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <text textAnchor="middle" className="cs-brandText" fontSize="25" fill={INK}>
          <Lines text={m.mascotBubble} x={170} y={44} lh={31} />
        </text>
      </g>
      {/* the character */}
      <g className="cs-hop">
        <path
          d="M87 233L127 337L170 269L213 337L253 233"
          fill="none"
          stroke={PINE}
          strokeWidth="42"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M87 233L127 337L170 269" fill="none" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" transform="translate(-6 -4)" />
        <circle cx="170" cy="206" r="35" fill={SUN} />
        <circle cx="158" cy="202" r="4.5" fill={INK} />
        <circle cx="182" cy="202" r="4.5" fill={INK} />
        <path d="M156 215q14 14 28 0" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        {/* sparkles at the hands */}
        <path d="M70 196l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill={SUN} className="cs-sparkle" />
        <path d="M270 190l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={MINT} className="cs-sparkle2" />
      </g>
      {/* LUL burst */}
      <g className="cs-burst">
        <polygon points={burstPoints(285, 168, 56, 38, 11)} fill={SUN} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
        <text x="285" y="181" textAnchor="middle" className="cs-brandText" fontSize="36" fill={INK}>
          {m.lulBurst}
        </text>
      </g>
      {/* the paper plane that got out */}
      <g className="cs-plane">
        <g transform="translate(40 352) rotate(-14)">
          <path d="M0 0L44 -16L26 18L18 4z" fill={PAPER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
          <path d="M18 4L44 -16" stroke={INK} strokeWidth="2.5" />
        </g>
      </g>
    </svg>
  );
}

/** ARKISTOSSA: the filing cabinet where your details live, and its auto-reply. */
export function FilingCabinet({ m }: { m: ComingSoonStrings }) {
  return (
    <svg viewBox="0 0 300 400" className="cs-cabinetSvg" aria-hidden="true" focusable="false">
      <ellipse cx="150" cy="392" rx="105" ry="8" fill={INK} opacity="0.14" />
      <g className="cs-reply">
        <path
          d="M28 6h244a22 22 0 0 1 22 22v76a22 22 0 0 1-22 22h-84l-18 28-18-28H28a22 22 0 0 1-22-22V28A22 22 0 0 1 28 6z"
          fill={PAPER}
          stroke={INK}
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <text textAnchor="middle" className="cs-sansText" fontSize="19.5" fontWeight="600" fill={INK}>
          <Lines text={m.autoReply} x={150} y={42} lh={27} />
        </text>
      </g>
      {/* cabinet */}
      <rect x="48" y="170" width="204" height="214" rx="12" fill="#C9D6D2" stroke={INK} strokeWidth="5" />
      {[0, 1, 2].map((i) => (
        <g key={i} className={i === 1 ? "cs-drawerOpen" : undefined}>
          <rect x="62" y={182 + i * 66} width="176" height="56" rx="7" fill="#E3F3EE" stroke={INK} strokeWidth="4" />
          <rect x="120" y={218 + i * 66} width="60" height="8" rx="4" fill={INK} />
        </g>
      ))}
      <rect x="72" y="188" width="156" height="30" rx="5" fill={PAPER} stroke={INK} strokeWidth="3" />
      <text x="150" y="210" textAnchor="middle" className="cs-brandText" fontSize="21" fill={INK} letterSpacing="1.5">
        {m.onFile}
      </text>
      <path d="M92 258h110M92 324h86" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" opacity="0.5" />
      {/* papers sticking out of the middle drawer */}
      <path d="M96 248l8-18 30 6-6 14z" fill={PAPER} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* cobweb and spider */}
      <path d="M252 170q-20 4-34 24M252 170q-6 20-4 40M252 170q-30 -2 -50 6" fill="none" stroke={INK} strokeWidth="2" opacity="0.5" />
      <g className="cs-spider">
        <line x1="60" y1="156" x2="60" y2="196" stroke={INK} strokeWidth="2" />
        <circle cx="60" cy="204" r="7" fill={INK} />
        <path d="M54 200l-8-4M54 206l-9 3M66 200l8-4M66 206l9 3" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** The crumpled CV in the corner. The filename is real text laid over the art. */
export function CrumpledCv({ m }: { m: ComingSoonStrings }) {
  return (
    <div className="cs-cvChip" role="img" aria-label={`${m.cvFileLabel}: ${m.cvFile}`}>
      <svg viewBox="0 0 220 84" aria-hidden="true" focusable="false">
        <path
          d="M8 22L40 6l30 10 34-12 36 12 36-8 28 16-8 24 10 20-30 12-36-6-34 8-34-10-30 6L4 56z"
          fill={PAPER}
          stroke={INK}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path d="M40 6l8 30-24 20M104 4l-6 34 28 14M176 12l-16 36 38 10M70 16l20 30-30 30" fill="none" stroke={INK} strokeWidth="2" opacity="0.28" />
      </svg>
      <span aria-hidden="true">{m.cvFile}</span>
    </div>
  );
}

/** The mascot with its arms lowered: the W is an M now. */
export function LoweredMascot({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 160 150" role="img" aria-label={label} className="cs-mSvg">
      <ellipse cx="80" cy="140" rx="52" ry="6" fill="#000" opacity="0.3" />
      <path d="M26 128L44 70L80 106L116 70L134 128" fill="none" stroke={MINT} strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="38" r="24" fill={SUN} />
      <circle cx="72" cy="35" r="3" fill={INK} />
      <circle cx="88" cy="35" r="3" fill={INK} />
      <path d="M71 49q9-7 18 0" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The listening mascot, glowing mint. */
export function GlowMascot({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 130 130" role="img" aria-label={label} className="cs-glowSvg">
      <defs>
        <radialGradient id="cs-glow" cx="50%" cy="55%" r="50%">
          <stop offset="0" stopColor={MINT} stopOpacity="0.55" />
          <stop offset="1" stopColor={MINT} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="65" cy="68" r="62" fill="url(#cs-glow)" className="cs-glowPulse" />
      <path d="M22 54L36 104L65 66L94 104L108 54" fill="none" stroke={MINT} strokeWidth="19" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="65" cy="32" r="16" fill={SUN} />
      <circle cx="59" cy="30" r="2.4" fill={INK} />
      <circle cx="71" cy="30" r="2.4" fill={INK} />
      <path d="M58 38q7 6 14 0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** A hole that paper falls into. Spins slowly. */
export function VoidHole({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={label} className="cs-voidSvg">
      <g className="cs-voidSpin">
        <ellipse cx="60" cy="60" rx="52" ry="52" fill="none" stroke={MINT} strokeWidth="3" strokeDasharray="14 10" opacity="0.7" />
        <ellipse cx="60" cy="60" rx="38" ry="38" fill="none" stroke={SUN} strokeWidth="3" strokeDasharray="10 9" opacity="0.8" />
        <ellipse cx="60" cy="60" rx="24" ry="24" fill="none" stroke={CREAM} strokeWidth="3" strokeDasharray="6 8" opacity="0.8" />
        <rect x="46" y="8" width="16" height="20" rx="2" fill={CREAM} />
        <rect x="88" y="62" width="14" height="18" rx="2" fill={CREAM} transform="rotate(30 95 71)" />
        <rect x="16" y="70" width="14" height="18" rx="2" fill={CREAM} transform="rotate(-24 23 79)" />
      </g>
      <circle cx="60" cy="60" r="13" fill="#000" />
      <circle cx="60" cy="60" r="13" fill="none" stroke={CORAL} strokeWidth="2" opacity="0.7" />
    </svg>
  );
}
