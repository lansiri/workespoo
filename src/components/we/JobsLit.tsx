"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./icons";
import { newIds } from "./newIds";
import { prefersReducedMotion } from "./flyNote";

export type JobTileData = { id: string; title: string; employer: string; place?: string | null; mentions?: string };

export type JobsLitText = {
  /** Sticker on the board edge, "Real open jobs". */
  sticker: string;
  /** Under the number, "open jobs in Espoo mention these skills". */
  countLabel: string;
  /** Fredoka line before the first note, "Real open jobs light up here as you talk." */
  emptyLine: string;
  /** "Source: Työmarkkinatori · Espoo and nearby" */
  source: string;
  /** Prefix of each tile's reason, "mentions:" */
  mentionsLabel: string;
  /** Footer, "More in your job feed once you approve your card." */
  more: string;
  /** Shown instead of a number when job matches cannot load. */
  error: string;
  /** Phone strip, "open jobs mention these" */
  mini: string;
  /** Phone strip before any note. */
  miniEmpty: string;
};

/** Counts up to `target` in `ms` (ease-out cubic). Jumps at once with reduced motion. Never blocks anything. */
function useCountTween(target: number, ms = 1100): number {
  const [value, setValue] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    const from = cur.current;
    if (from === target) return;
    const duration = prefersReducedMotion() || from === 0 ? 0 : ms;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (now - t0) / duration);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
      cur.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** The big number and the neutral "+N new" pill. The number counts postings, never people. */
export function JobsCounter({ count, delta, deltaLabel, locale = "en", animateDelta }: { count: number; delta?: number; deltaLabel?: string; locale?: string; animateDelta?: boolean }) {
  const shown = useCountTween(count);
  const fmt = new Intl.NumberFormat(locale);
  return (
    <div className="we-count-row">
      <span className="we-count" data-testid="jobs-lit-count">
        {fmt.format(shown)}
      </span>
      {delta && deltaLabel ? <JobsDelta label={deltaLabel} animate={animateDelta} /> : null}
    </div>
  );
}

/** Neutral pill: ink outline, never green, never an arrow. Stays until the next answer. */
export function JobsDelta({ label, animate }: { label: string; animate?: boolean }) {
  return <span className={cx("we-delta", animate && "we-in")}>{label}</span>;
}

export function JobTile({ tile, mentionsLabel, enterDelay }: { tile: JobTileData; mentionsLabel: string; enterDelay?: number }) {
  return (
    <li className={cx("we-tile", enterDelay !== undefined && "we-enter")} style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined} data-job-id={tile.id}>
      <span className="we-ic">
        <Icon name="briefcase" />
      </span>
      <b>{tile.title}</b>
      <span>
        {tile.place ? `${tile.employer} · ${tile.place}` : tile.employer}
      </span>
      {tile.mentions ? (
        <em>
          {mentionsLabel} {tile.mentions}
        </em>
      ) : null}
    </li>
  );
}

/** One line in the phone's fixed bottom bar: count, words, delta. */
export function JobsMini({ count, delta, deltaLabel, text, locale = "en" }: { count?: number; delta?: number; deltaLabel?: string; text: Pick<JobsLitText, "mini" | "miniEmpty">; locale?: string }) {
  return (
    <p className="we-jobs-mini" aria-hidden="true">
      {count ? (
        <>
          <b>{new Intl.NumberFormat(locale).format(count)}</b>
          <span>{text.mini}</span>
          {delta && deltaLabel ? <span className="we-delta">{deltaLabel}</span> : null}
        </>
      ) : (
        <span>{text.miniEmpty}</span>
      )}
    </p>
  );
}

export type JobsLitProps = {
  /** Number of real active postings that mention the person's skills. Undefined or 0 shows the empty line. */
  count?: number;
  delta?: number;
  /** "+29 new" */
  deltaLabel?: string;
  /** Newest first. At most four are shown. */
  tiles: JobTileData[];
  error?: boolean;
  text: JobsLitText;
  locale?: string;
  className?: string;
};

/**
 * Board showing how many real open jobs mention the person's skills, rising as they talk. Cream, 2 px ink border,
 * ink shadow, sticker on the edge. Tiles that are new since the last render slide in (620 ms, 140 ms stagger).
 */
export function JobsLit({ count, delta, deltaLabel, tiles, error, text, locale, className }: JobsLitProps) {
  const uid = useId();
  const ids = tiles.slice(0, 4).map((t) => t.id);
  const key = ids.join("|");
  const [known, setKnown] = useState<string[]>(ids);
  const [lastKey, setLastKey] = useState(key);
  const [fresh, setFresh] = useState<string[]>([]);
  if (key !== lastKey) {
    setLastKey(key);
    setFresh(newIds(known, ids));
    setKnown(ids);
  }
  const shownTiles = tiles.slice(0, 4);
  const freshOrder = shownTiles.filter((t) => fresh.includes(t.id));
  return (
    <section className={cx("we-jobs", className)} aria-labelledby={`${uid}-t`} data-testid="jobs-lit">
      <span className="we-sticker we-d-only" aria-hidden="true">
        {text.sticker}
      </span>
      <h3 className="we-sr-only" id={`${uid}-t`}>
        {text.sticker}
      </h3>
      {error ? (
        <p className="we-jobs-error" role="status">
          {text.error}
        </p>
      ) : count ? (
        <>
          <JobsCounter count={count} delta={delta} deltaLabel={deltaLabel} locale={locale} animateDelta />
          <p className="we-count-label">{text.countLabel}</p>
        </>
      ) : (
        <p className="we-jobs-empty-line">{text.emptyLine}</p>
      )}
      <p className="we-count-src">{text.source}</p>
      <ul className="we-tiles">
        {shownTiles.length === 0 && !error ? (
          <>
            <li className="we-tile we-ghost" aria-hidden="true">
              <span className="we-ic" />
            </li>
            <li className="we-tile we-ghost" aria-hidden="true">
              <span className="we-ic" />
            </li>
          </>
        ) : (
          shownTiles.map((t) => {
            const n = freshOrder.findIndex((f) => f.id === t.id);
            return <JobTile key={t.id} tile={t} mentionsLabel={text.mentionsLabel} enterDelay={n >= 0 ? n * 140 : undefined} />;
          })
        )}
        {shownTiles.length > 0 ? <li className="we-tiles-more">{text.more}</li> : null}
      </ul>
    </section>
  );
}

