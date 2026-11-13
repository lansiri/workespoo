import { Fragment } from "react";
import { cx } from "./cx";

export type PoolEvidenceKind = "normal" | "language" | "statutory" | "wholePool";

export type PoolEvidenceLineProps = {
  kind: PoolEvidenceKind;
  speakTo: number;
  relevant: number;
  exclude?: number;
  selfDeclaredOnly?: number;
  wholePool?: number;
  /** Templates from need-card.md 5.4. `**bold**` marks the numbers that are bold. Placeholders: {speakTo} {relevant} {exclude} {selfDeclaredOnly} {wholePool}. */
  templates: { normal: string; languageExtra: string; statutory: string; wholePool: string };
  /** "As of 09:14" */
  asOf: string;
  className?: string;
};

/** Pool aggregate that shows what a hard filter would set aside. About the pool, never about one person. */
export function PoolEvidenceLine(p: PoolEvidenceLineProps) {
  const values: Record<string, number | undefined> = {
    speakTo: p.speakTo,
    relevant: p.relevant,
    exclude: p.exclude,
    selfDeclaredOnly: p.selfDeclaredOnly,
    wholePool: p.wholePool,
  };
  const base = p.kind === "statutory" ? p.templates.statutory : p.kind === "wholePool" ? p.templates.wholePool : p.templates.normal;
  const tpl = p.kind === "language" && p.selfDeclaredOnly !== undefined ? `${base} ${p.templates.languageExtra}` : base;
  const filled = tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
  return (
    <p className={cx("we-evidence-line", p.className)} data-testid="pool-evidence">
      {filled.split("**").map((seg, i) => (
        <Fragment key={i}>{i % 2 === 1 ? <b>{seg}</b> : seg}</Fragment>
      ))}
      <small>{p.asOf}</small>
    </p>
  );
}
