/**
 * Shared inputs for the three job-interview prompts (docs/specs/prompts/application.md).
 * Three postings from fixtures/jobs/tmt-sample.json, each with the requirements a Need Card
 * would hold (English text, the ad's own sentence in the ad's language). Everything about
 * people here is synthetic.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { employerTerms } from "@/lib/mask";

export type Lang = "en" | "fi" | "sv";
export const LANG_NAME: Record<Lang, string> = { en: "English", fi: "Finnish", sv: "Swedish" };

export type Req = { kind: "must" | "nice"; text: string; ad: string; anchors: RegExp; language?: boolean };
export type Job = { id: string; fixtureIndex: number; title: string; employer: string[]; reqs: Req[] };

export const JOBS: Record<string, Job> = {
  dev: {
    id: "dev",
    fixtureIndex: 4,
    title: "Software Developer (full-stack) for energy sector, Espoo",
    employer: ["Academic Work Finland Oy"],
    reqs: [
      {
        kind: "must",
        text: "Building backend APIs and integrating applications with other systems",
        ad: "Experience with client-server architectures, backend API development, and system integration",
        anchors: /api|rajapin|integra|backend|taustapalvel|client|asiakas.?palvelin|klient|system/i,
      },
      {
        kind: "must",
        text: "Developing frontend applications with React",
        ad: "Experience developing frontend applications with React",
        anchors: /react/i,
      },
      {
        kind: "must",
        text: "Using CI/CD pipelines and a cloud platform (AWS or Azure)",
        ad: "Basic familiarity with cloud platforms (AWS or Azure), version control, and utilizing CI/CD pipelines and DevSecOps practices",
        anchors: /ci\/cd|aws|azure|pipeline|devsecops|putki|pipelin|moln|pilvi/i,
      },
      {
        kind: "must",
        text: "Using English at work, spoken and written",
        ad: "Fluency in spoken and written English",
        anchors: /english|englan|engelsk/i,
        language: true,
      },
      {
        kind: "nice",
        text: "Working with SQL and NoSQL databases",
        ad: "Basic knowledge of SQL and NoSQL databases",
        anchors: /sql|database|tietokan|databas/i,
      },
    ],
  },
  forklift: {
    id: "forklift",
    fixtureIndex: 22,
    title: "Trukkikuski syksyn rengaslogistiikkaan",
    employer: ["Mestarit Henkilöstöpalvelut Oy"],
    reqs: [
      {
        kind: "must",
        text: "Driving a forklift in narrow aisles between shelves",
        ad: "Kykyä työskennellä trukilla ahtaissa hyllyväleissä",
        anchors: /aisle|hyllyväl|ahta|kapea|gång|hyllor|shel/i,
      },
      {
        kind: "must",
        text: "Experience of warehouse or logistics work",
        ad: "Aiemman kokemuksen varasto- tai logistiikkatehtävistä",
        anchors: /warehouse|logistic|varast|logistiik|lager|logistik/i,
      },
      {
        kind: "must",
        text: "Using Finnish at work",
        ad: "Sujuva suomenkieli",
        anchors: /finnish|suome|finska/i,
        language: true,
      },
      {
        kind: "nice",
        text: "Receiving, inspecting and handling tyres",
        ad: "Renkaiden vastaanotto, tarkastus ja käsittely",
        anchors: /tyre|tire|renga|renka|däck/i,
      },
      {
        kind: "nice",
        text: "Running and monitoring a tyre washing line",
        ad: "Rengaspesulinjaston käyttö ja valvonta",
        anchors: /wash|pesu|tvätt/i,
      },
    ],
  },
  nurse: {
    id: "nurse",
    fixtureIndex: 14,
    title: "Sjukskötare, Grankulla hälsostation, Grankulla",
    employer: ["Västra Nylands välfärdsområde", "Länsi-Uudenmaan hyvinvointialue"],
    reqs: [
      {
        kind: "must",
        text: "Assessing patients' need for care at the reception and by phone",
        ad: "Sjukskötarens arbetsbild är mångsidig och omfattar vårdbehovsbedömning, icke-brådskande mottagningstider, skötsel av patientbyrån samt jouruppgifter.",
        anchors: /phone|telefon|puhel|vårdbehov|hoidon tarpe|need for care|assess|bedöm|arvio|reception|vastaanot|mottagning/i,
      },
      {
        kind: "must",
        text: "Using IT systems in patient work",
        ad: "För att lyckas i uppgiften krävs förutom vårdkunnande även goda IT-kunskaper samt flytande kunskaper i finska.",
        anchors: /\bit\b|it-|system|tietojärj|tietotekn|dator|tietokone|computer|patient record|potilastie|journal/i,
      },
      {
        kind: "must",
        text: "Using Finnish at work",
        ad: "För att lyckas i uppgiften krävs förutom vårdkunnande även goda IT-kunskaper samt flytande kunskaper i finska.",
        anchors: /finnish|suome|finska/i,
        language: true,
      },
      {
        kind: "nice",
        text: "Working closely with doctors and other care staff in a multiprofessional team",
        ad: "Vi arbetar mångprofessionellt och arbetet utförs i nära samarbete mellan vårdpersonal och läkare i gemensamma arbetsutrymmen.",
        anchors: /doctor|läkare|lääkär|multiprofession|mångprofession|moniammat|team|tiimi/i,
      },
      {
        kind: "nice",
        text: "Earlier work at a health station",
        ad: "Tidigare erfarenhet av arbete på hälsostation är också meriterande.",
        anchors: /health station|hälsostation|terveysasem|health centre|health center/i,
      },
    ],
  },
};

export function terms(job: Job): string[] {
  return employerTerms(...job.employer);
}

/** The system prompt of one section of the spec (A, B or C), word for word. */
export function specSystemPrompt(section: "A" | "B" | "C"): string {
  const root = path.resolve(import.meta.dirname, "../../..");
  const md = readFileSync(path.join(root, "docs/specs/prompts/application.md"), "utf8");
  const start = md.indexOf(`## ${section}. `);
  if (start < 0) throw new Error(`section ${section} not found`);
  const rest = md.slice(start);
  const sys = rest.indexOf("### System prompt");
  const open = rest.indexOf("```\n", sys);
  const close = rest.indexOf("\n```", open + 4);
  return rest.slice(open + 4, close);
}

export function planUserMessage(job: Job, lang: Lang): string {
  const lines = [`JOB: ${job.title}`, `WRITE IN: ${LANG_NAME[lang]}`, "", "REQUIREMENTS"];
  job.reqs.forEach((r, i) => {
    lines.push(`[R${i + 1}] (${r.kind === "must" ? "must-have" : "nice-to-have"}) ${r.text}`);
    if (r.ad) lines.push(`From the ad: "${r.ad}"`);
  });
  return lines.join("\n");
}
