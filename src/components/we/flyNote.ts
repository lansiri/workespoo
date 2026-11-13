/**
 * flyNote: one reusable helper for the moment a note lands.
 *
 * It clones the target chip, flies the clone from the marked sentence to the mascot's head, round the mascot
 * on a 5-point arc (radius 0.66 x mascot size, swinging toward the notes list) and into the chip's slot, then
 * reveals the real chip. 1900 ms, cubic-bezier(.45,.05,.35,1). Notes from one answer start 450 ms apart.
 *
 * The page stays correct if this is skipped or fails: it never owns state. With reduced motion, or without the
 * Web Animations API, it resolves at once and the chip simply appears in place (fresh styling shows the outline).
 */

export const FLIGHT_MS = 1900;

export type FlyNoteOptions = {
  /** The mascot element. Defaults to [data-testid="interviewer-mascot"]. */
  mascot?: Element | null;
  /** Called when the note reaches the head (38 % of the flight): pop the head here. */
  onCatch?: () => void;
};

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function center(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top };
}

function sourcePoint(el: Element) {
  const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
  return { x: r.left + Math.min(r.width, 220) / 2, y: r.top + r.height / 2 };
}

export function flyNote(sourceEl: Element | null, targetEl: HTMLElement | null, delayMs = 0, options: FlyNoteOptions = {}): Promise<void> {
  const reveal = () => {
    targetEl?.removeAttribute("data-pending");
    targetEl?.classList.remove("we-pending");
  };
  if (typeof document === "undefined" || !targetEl || prefersReducedMotion() || typeof targetEl.animate !== "function") {
    reveal();
    return Promise.resolve();
  }
  const mascot = options.mascot ?? document.querySelector('[data-testid="interviewer-mascot"]');
  if (!mascot) {
    reveal();
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    try {
      const flyer = targetEl.cloneNode(true) as HTMLElement;
      flyer.classList.remove("we-pending");
      flyer.removeAttribute("data-pending");
      flyer.removeAttribute("id");
      flyer.setAttribute("aria-hidden", "true");
      flyer.setAttribute("tabindex", "-1");
      flyer.classList.add("we-flyer", "we-fresh");
      document.body.appendChild(flyer);
      const fr = flyer.getBoundingClientRect();
      const hw = fr.width / 2;
      const hh = fr.height / 2;
      const m = center(mascot);
      const head = { x: m.x, y: m.top + m.h * 0.233 };
      const s = sourceEl ? sourcePoint(sourceEl) : head;
      const to = center(targetEl);
      const R = m.w * 0.66;
      const startA = -Math.PI / 2;
      const endA = Math.atan2(to.y - m.y, to.x - m.x);
      let sweep = endA - startA;
      if (sweep < 0.5) sweep += Math.PI * 2;
      if (sweep > Math.PI * 1.5) sweep -= Math.PI * 2;
      const at = (x: number, y: number, sc: number) => `translate(${x - hw}px, ${y - hh}px) scale(${sc})`;
      const kf: Keyframe[] = [
        { transform: at(s.x, s.y, 0.5), opacity: 0, offset: 0 },
        { transform: at(s.x, s.y - 8, 1), opacity: 1, offset: 0.12 },
        { transform: at(head.x, head.y, 0.92), opacity: 1, offset: 0.38 },
      ];
      const N = 5;
      for (let i = 1; i <= N; i++) {
        const a = startA + (sweep * i) / N;
        kf.push({ transform: at(m.x + Math.cos(a) * R, m.y + Math.sin(a) * R, 1), opacity: 1, offset: 0.38 + 0.44 * (i / N) });
      }
      kf.push({ transform: at(to.x, to.y, 1), opacity: 1, offset: 1 });
      const anim = flyer.animate(kf, { duration: FLIGHT_MS, delay: delayMs, easing: "cubic-bezier(.45,.05,.35,1)", fill: "both" });
      const catchTimer = options.onCatch ? setTimeout(options.onCatch, delayMs + FLIGHT_MS * 0.38) : undefined;
      const done = () => {
        reveal();
        flyer.remove();
        resolve();
      };
      anim.onfinish = done;
      anim.oncancel = () => {
        clearTimeout(catchTimer);
        done();
      };
    } catch {
      reveal();
      resolve();
    }
  });
}
