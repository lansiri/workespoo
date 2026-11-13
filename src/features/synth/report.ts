/** Render the evaluation as `evals/report.json` and `evals/report.md`. */
import type { MetricResult } from "./metrics";
import { checkPlanted, overallVerdict } from "./metrics";
import type { SimulatedRun } from "./run";

export type ReportMeta = {
  generatedAt: string;
  /** `fake` marks a report produced against the built-in stand-in: it proves the harness, not the product. */
  engine: "real" | "fake";
  mode: "persona" | "express" | "full";
  personas: number;
};

export type PersonaSummary = {
  id: string;
  interviewLang: string;
  mode: string;
  questions: number;
  probes: number;
  answers: number;
  signals: number;
  escoGrounded: number;
  plantedKinds: string[];
  leakedTokens: string[];
  skillKept: boolean;
};

export type Report = {
  meta: ReportMeta;
  verdict: "pass" | "fail";
  metrics: MetricResult[];
  personas: PersonaSummary[];
};

export function summarisePersona(run: SimulatedRun): PersonaSummary {
  const check = checkPlanted(run);
  const interviewer = run.turns.filter((t) => t.role === "interviewer");
  return {
    id: run.persona.id,
    interviewLang: run.persona.interviewLang,
    mode: run.mode,
    questions: 1 + interviewer.filter((t) => t.kind === "question" || t.kind === "probe").length,
    probes: interviewer.filter((t) => t.kind === "probe").length,
    answers: run.turns.filter((t) => t.role === "participant").length,
    signals: run.person.signals.length,
    escoGrounded: run.person.signals.filter((s) => s.esco !== null).length,
    plantedKinds: run.persona.planted.map((p) => p.kind),
    leakedTokens: check.leaked,
    skillKept: check.skillKept,
  };
}

export function buildReport(runs: SimulatedRun[], metrics: MetricResult[], meta: ReportMeta): Report {
  return { meta, verdict: overallVerdict(metrics), metrics, personas: runs.map(summarisePersona) };
}

const fmt = (m: MetricResult): string => {
  if (m.value === null) return "n/a";
  if (m.id === "16") return `${Math.round(m.value)} ms`;
  if (m.threshold.startsWith("= 0")) return String(m.value);
  return Number.isInteger(m.value) ? String(m.value) : m.value.toFixed(3);
};

export function renderMarkdown(report: Report): string {
  const { meta } = report;
  const lines: string[] = [];
  lines.push("# Interview evaluation report", "");
  lines.push(`Generated ${meta.generatedAt}. ${meta.personas} simulated interviews, mode: ${meta.mode}. Engine: **${meta.engine}**.`, "");
  if (meta.engine === "fake") {
    lines.push("> **This report was produced against the built-in fake engine.** It proves that the harness runs and that each check can pass and fail. It says nothing about the interviewer.", "");
  }
  lines.push(`Overall: **${report.verdict.toUpperCase()}** (every enforced metric that could be computed must pass; the others are reported).`, "");
  lines.push("## Metrics", "", "| # | Metric | Value | n | Threshold | Enforced | Result |", "|---|---|---|---|---|---|---|");
  for (const m of report.metrics) {
    lines.push(`| ${m.id} | ${m.name} | ${fmt(m)} | ${m.n} | ${m.threshold} | ${m.enforced ? "yes" : "report"} | ${m.status.toUpperCase()} |`);
  }
  lines.push("");
  const notes = report.metrics.filter((m) => m.note);
  if (notes.length > 0) {
    lines.push("## Notes on each metric", "");
    for (const m of notes) lines.push(`- **${m.id} ${m.name}.** ${m.note}`);
    lines.push("");
  }
  const failed = report.metrics.filter((m) => m.failures.length > 0);
  if (failed.length > 0) {
    lines.push("## What failed", "");
    for (const m of failed) {
      lines.push(`**${m.id} ${m.name}**`, "");
      for (const f of m.failures.slice(0, 20)) lines.push(`- ${f}`);
      if (m.failures.length > 20) lines.push(`- ... and ${m.failures.length - 20} more`);
      lines.push("");
    }
  }
  lines.push("## Personas", "", "| Persona | Language | Mode | Questions | Probes | Signals | Grounded in ESCO | Protected fact planted | Leaked to the card | Skill kept |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const p of report.personas) {
    lines.push(`| ${p.id} | ${p.interviewLang} | ${p.mode} | ${p.questions} | ${p.probes} | ${p.signals} | ${p.escoGrounded} | ${p.plantedKinds.join("; ")} | ${p.leakedTokens.length === 0 ? "none" : p.leakedTokens.join(", ")} | ${p.skillKept ? "yes" : "no"} |`);
  }
  lines.push("", "Every person in this report is synthetic. Transcripts are not reproduced here.", "");
  return lines.join("\n");
}
