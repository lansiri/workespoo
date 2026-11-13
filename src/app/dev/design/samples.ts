/**
 * English sample text for the gallery. The kit has no text of its own: this is what a screen would pass in
 * from its message tables. Every person here is synthetic.
 */
import type { ReasonText, SkillRowData, SkillRowText, NoteItem, JobTileData, JobsLitText, RequirementItem } from "@/components/we";

export const reasonText: ReasonText = {
  cardLabel: "From the card · AI wording",
  postingLabel: "From the posting",
  mentions: "Mentions {label}",
  seeOwnWords: "See your own words",
  hideOwnWords: "Hide your own words",
  yourWords: "Your words",
  revealedLabel: "In their own words",
  revealedNote: "Shown to you after you both agreed",
};
export const feedReason: ReasonText = { ...reasonText, cardLabel: "From your card" };
export const companyReason: ReasonText = { ...reasonText, postingLabel: "From your posting" };
export const introReason: ReasonText = { ...reasonText, cardLabel: "From your card", postingLabel: "From their need" };

export const rowText: SkillRowText = {
  edit: "Edit",
  remove: "Remove",
  undo: "Undo",
  removedNote: "Removed.",
  escoLabel: "ESCO",
  noEsco: "No ESCO match. That's fine; it stays on your card.",
  yourWords: "Your words",
  shownAs: "Shown to companies as",
  aiTag: "AI",
  addedByYou: "Added by you",
  stale: "Preparing company view…",
  editAria: "Edit {phrase}",
  removeAria: "Remove {phrase}",
  inputLabel: "Note",
  save: "Save",
  cancel: "Cancel",
};

export const notMentionedText = {
  label: "Not mentioned in the conversation",
  statutory: "(checked by the employer at hiring)",
  fine: "Not mentioned does not mean missing.",
  notRead: "Requirements not read yet.",
};

export const signals: SkillRowData[] = [
  {
    id: "s1", phrase: "Fixing barcode scanners", group: "skill",
    esco: { en: "use scanning equipment", fi: "skannauslaitteiden käyttö" }, addedBy: "ai",
    rendering: "Repairs and resets handheld scanners on the warehouse floor so picking does not stop.",
    quotes: [{ refLabel: "Answer 2", text: "When a scanner freezes I'm the one they call. Usually it is the battery or the dock, I swap it and re-pair it." }],
  },
  {
    id: "s2", phrase: "Receiving and checking deliveries", group: "skill",
    esco: { en: "receive incoming goods", fi: "saapuvien tavaroiden vastaanotto" }, addedBy: "ai",
    rendering: "Receives pallets, checks them against the delivery note and reports differences.",
    quotes: [
      { refLabel: "Answer 1", text: "I take in the morning trucks and check every pallet against the note." },
      { refLabel: "Answer 3", text: "If the count is off I write it up before I sign." },
    ],
  },
  {
    id: "s3", phrase: "Warehouse management system", group: "tool",
    esco: { en: "operate warehouse management systems", fi: "varastonhallintajärjestelmien käyttö" }, addedBy: "ai",
    rendering: "Works daily in a warehouse management system to book goods in and out.",
    quotes: [{ refLabel: "Answer 1", text: "We book everything in the system, I do it on the handheld." }],
  },
  {
    id: "s4", phrase: "Safe handling of dangerous goods", group: "knowledge",
    esco: { en: "dangerous goods regulations", fi: "vaarallisten aineiden säädökset" }, addedBy: "ai",
    rendering: "Knows how to label and store dangerous goods according to the site rules.",
    quotes: [{ refLabel: "Answer 4", text: "I did the ADR course two years ago and I still check the labels every time." }],
  },
  {
    id: "s5", phrase: "Teaching new colleagues", group: "skill",
    esco: null, addedBy: "person",
    rendering: "They list teaching new colleagues as a skill.", quotes: [],
  },
  {
    id: "s6", phrase: "Logistics", group: "domain",
    esco: { en: "logistics", fi: "logistiikka" }, addedBy: "ai",
    rendering: "Has worked in logistics for six years.",
    quotes: [{ refLabel: "Answer 5", text: "Six years in logistics now, all in Espoo and Vantaa." }],
  },
];

export const noteSamples: NoteItem[] = [
  { id: "s1", label: "Fixing barcode scanners", group: "skill", refLabel: "answer 2" },
  { id: "s2", label: "Receiving and checking deliveries", group: "skill", refLabel: "answer 1" },
  { id: "s3", label: "Warehouse management system", group: "tool", refLabel: "answer 1" },
  { id: "s4", label: "Safe handling of dangerous goods", group: "knowledge", refLabel: "answer 4" },
  { id: "s6", label: "Ohjeiden ja tarkistuslistojen kirjoittaminen", group: "domain", refLabel: "vastaus 5" },
];

export const jobsText: JobsLitText = {
  sticker: "Real open jobs",
  countLabel: "open jobs in Espoo mention these skills",
  emptyLine: "Real open jobs light up here as you talk.",
  source: "Source: Työmarkkinatori · Espoo and nearby",
  mentionsLabel: "mentions:",
  more: "More in your job feed once you approve your card.",
  error: "Job matches are not available right now. Your notes are saved.",
  mini: "open jobs mention these",
  miniEmpty: "Real open jobs light up as you talk",
};

export const jobTiles: JobTileData[] = [
  { id: "j1", title: "Scanner and device support, warehouse", employer: "Nordic Parcel Demo Oy", place: "Vantaa", mentions: "scanning equipment" },
  { id: "j2", title: "Receiving clerk, night shift", employer: "Espoo Logistics Hub (demo)", place: "Espoo", mentions: "receive incoming goods" },
  { id: "j3", title: "Order picker, Leppävaara", employer: "Kauppahalli Demo Oy", place: "Espoo", mentions: "warehouse systems" },
  { id: "j4", title: "Logistics coordinator trainee", employer: "Aalto Freight Demo", place: "Espoo", mentions: "logistics" },
  { id: "j5", title: "Dangerous goods handler", employer: "Tapiola Chem Demo Oy", place: "Espoo", mentions: "dangerous goods" },
];

export const questions = [
  "Tell me about a normal day at work last week. What did you do, from start to finish?",
  "You mentioned the scanners. How do you usually work out what is wrong with one?",
  "What do you do when something arrives and it does not match the delivery note?",
  "Is there something you know well that people at work ask you about?",
  "Last one. What would you like to do more of in your next job?",
];

export const answers: { sentences: string[]; cited: number[]; notes: string[] }[] = [
  { sentences: ["I work in a warehouse in Vantaa, mostly mornings.", "I take in the trucks and check every pallet against the note.", "Everything gets booked in the system on the handheld."], cited: [1, 2], notes: ["s2", "s3"] },
  { sentences: ["When a scanner freezes I'm the one they call.", "Usually it is the battery or the dock, I swap it and re-pair it."], cited: [0, 1], notes: ["s1"] },
  { sentences: ["If the count is off I write it up before I sign.", "Then the office sorts it out."], cited: [0], notes: [] },
  { sentences: ["I did the ADR course two years ago.", "I still check the labels every time."], cited: [0, 1], notes: ["s4"] },
  { sentences: ["Six years in logistics now, all in Espoo and Vantaa.", "I would like to train people more."], cited: [0], notes: ["s6"] },
];

export const requirements: RequirementItem[] = [
  { id: "r1", text: "Fluent working Finnish", kind: "must", category: "Language", postingSentence: "Työkielenä on suomi, joten sujuva suomen kielen taito on välttämätön." },
  { id: "r2", text: "Experience with a warehouse management system", kind: "must", category: "Tool", postingSentence: "Käytät päivittäin varastonhallintajärjestelmää." },
  { id: "r3", text: "Forklift licence (truck class T1)", kind: "must", category: "Licence", statutory: true, postingSentence: "Trukkikortti vaaditaan." },
  { id: "r4", text: "Experience of teaching new colleagues", kind: "nice", category: "Skill", addedByYou: true },
];

export const requirementText = {
  must: "Must-have", nice: "Nice-to-have", fromPosting: "From your posting", addedByYou: "Added by you",
  showSentence: "Show the sentence", hideSentence: "Hide the sentence", edit: "Edit", save: "Save", cancel: "Cancel",
  statutory: "Set by law or regulation. Not questioned here; the employer checks it at hiring.", kindGroup: "Kind of requirement",
};

export const evidenceTemplates = {
  normal: "**{speakTo} of {relevant}** people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside **{exclude}**. They did not mention it in a short conversation; that does not mean they lack it. No filter is applied.",
  languageExtra: "({selfDeclaredOnly} of them by naming it as a work language.)",
  statutory: "**{speakTo} of {relevant}** speak to this. Set by law or regulation; the employer checks it at hiring.",
  wholePool: "Nobody in the pool relates to this role yet. Across the whole pool of {wholePool}, **{speakTo}** speak to this requirement.",
};

export const removeReasons = [
  { code: "not_hold_up", label: "The reasons do not hold up when I read the card" },
  { code: "in_contact", label: "Already in contact with this company" },
  { code: "other_need", label: "Same person already picked for another need of this company" },
  { code: "asked_not", label: "The person asked not to be suggested here" },
  { code: "other", label: "Other (write why)" },
];
