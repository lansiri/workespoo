"use client";

import "./gallery.css";
import { useState, type ReactNode } from "react";
import {
  AiDisclosure, ApproveBox, Button, Checkbox, ChoiceCard, CompanyPickCard, CompanyPreviewBanner, CompanyViewSwitch, DataControls, DecisionControls, Dialog,
  EmptyState, ErrorState, Field, HoldToTalk, Input, IntroRequest, InterviewerLine, InterviewerMascot, JobPostingCard, JobsLit, JobsMini, KeysBar, KeysOverlay,
  LoadingState, MaskedDemoBanner, NoteChip, NotesList, NotMentionedList, OrganiserPickCard, OrganiserPreview, OwnWordsMark, PageShell, PersonHandle, PoolConsent,
  PoolEvidenceLine, PrototypeLine, PublishBox, PurgeNotice, ReasonLine, ReasonList, RemoveReasonDialog, RequirementList, RequirementQuestion, SeededDemoBanner,
  SignalCard, SkillRow, Slot, Sticker, SyntheticTag, Tag, AiTag, Textarea, Select, Toast, Transcript, TypeAnswer, TypeInsteadButton, WordsBox, CheerMark, Icon,
  type MascotState, type NoteItem, type ReasonVariant,
} from "@/components/we";
import { InterviewDemo } from "./InterviewDemo";
import { CardDemo } from "./CardDemo";
import {
  companyReason, evidenceTemplates, feedReason, introReason, jobTiles, jobsText, noteSamples, notMentionedText, reasonText, removeReasons, requirementText, requirements,
  rowText, signals,
} from "./samples";

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="wg-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {note ? <p className="wg-note">{note}</p> : null}
      {children}
    </section>
  );
}
function Spec({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`wg-spec ${className ?? ""}`}>
      <span className="wg-label">{label}</span>
      {children}
    </div>
  );
}

const shellBase = {
  logoLabel: "WorkEspoo", wordmark: "WorkEspoo", navLabel: "Main", languageLabel: "Language", menuLabel: "Menu",
  languages: [
    { code: "en" as const, label: "English", href: "#", current: true },
    { code: "fi" as const, label: "Suomi", href: "#", current: false },
    { code: "sv" as const, label: "Svenska", href: "#", current: false },
  ],
};
const talentNav = [
  { key: "interview", label: "Interview", href: "#" },
  { key: "card", label: "My card", href: "#" },
  { key: "matches", label: "My matches", href: "#" },
  { key: "how", label: "How this works", href: "#" },
];
const organiserNav = [
  { key: "overview", label: "Overview", href: "#" },
  { key: "review", label: "Today's review", href: "#", badge: "5" },
  { key: "pool", label: "Pool", href: "#" },
  { key: "exposure", label: "Exposure", href: "#" },
  { key: "audit", label: "Audit log", href: "#" },
];

const COLOURS: [string, string, string][] = [
  ["pine", "#0E5E55", "Primary, the W, links"], ["pine-700", "#0A4A43", "Primary hover"], ["pine-50", "#E7F1EF", "Primary tint"], ["pine-100", "#C9DFDA", "Tint border"],
  ["sun", "#FFB627", "Head, stickers, focus"], ["sun-soft", "#FFF1D6", "Own-words boxes"], ["cream", "#FBF7F0", "Page"], ["paper", "#FFFDF8", "Surface"],
  ["ink", "#1E2B29", "Text, hard shadows"], ["muted-ink", "#4A5754", "Secondary text"], ["faint", "#6B7673", "Disabled only"], ["line", "#E7DFD1", "Hairline"],
  ["line-strong", "#CFC5B3", "Inputs, dashed"], ["mint", "#5ED1B6", "Listening"], ["mint-soft", "#E3F5EF", "Live caption"], ["leaf", "#2F7A3E", "Approved"],
  ["leaf-soft", "#E6F2E8", "Confirmed chip"], ["amber", "#8A5300", "Own-words label"], ["danger", "#9B2C14", "Delete own data"], ["night", "#14211F", "Scrims, toasts"],
];

function MascotSpecimens() {
  const [level, setLevel] = useState(0.55);
  const [caught, setCaught] = useState(0);
  const states: [MascotState, string][] = [["idle", "Your turn"], ["listening", "Listening…"], ["thinking", "Writing a question…"], ["speaking", "Speaking"]];
  return (
    <>
      <div className="wg-grid">
        {states.map(([s, label]) => (
          <Spec key={s} label={`state="${s}"`}>
            <div className="wg-box wg-cream">
              <InterviewerMascot state={s} level={level} size={190} badgeLabel={label} catchKey={caught} />
            </div>
          </Spec>
        ))}
        <Spec label="finished">
          <div className="wg-box wg-cream">
            <InterviewerMascot state="idle" finished size={190} badgeLabel="Interview finished" />
          </div>
        </Spec>
        <Spec label="Controls for the specimens">
          <div className="wg-box">
            <label className="wg-slider">
              Microphone level
              <input type="range" min={0} max={1} step={0.01} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Microphone level" />
            </label>
            <div className="wg-tools">
              <button type="button" onClick={() => setCaught((c) => c + 1)}>
                Pop the head (note caught)
              </button>
            </div>
            <p className="wg-note">Sizes: 236 desktop, 132 phone, 168 presenter at 720 high, 300 from 1800 wide. Leave size out for the responsive defaults.</p>
          </div>
        </Spec>
      </div>
      <div className="wg-row" style={{ marginTop: 24, alignItems: "flex-end" }}>
        {[96, 132, 168].map((n) => (
          <InterviewerMascot key={n} state="idle" size={n} badgeLabel={`${n} px`} />
        ))}
      </div>
    </>
  );
}

function NotesSpecimen() {
  const [list, setList] = useState<NoteItem[]>(noteSamples.slice(0, 3).map((n, i) => ({ ...n, fresh: i === 2 })));
  return (
    <div className="wg-grid">
      <Spec label="Filled. Add a note: only the new chip animates.">
        <div className="wg-box">
          <NotesList notes={list} order="conversation" text={{ title: "Notes so far", help: "You'll check and edit these at the end.", empty: "", newLabel: "NEW", noted: "Noted: {phrase}" }} />
          <div className="wg-tools">
            <Button onClick={() => setList((l) => (l.length < noteSamples.length ? [...l.map((x) => ({ ...x, fresh: false })), { ...noteSamples[l.length], fresh: true }] : l))}>Add the next note</Button>
            <Button variant="quiet" onClick={() => setList(noteSamples.slice(0, 3))}>Reset</Button>
          </div>
        </div>
      </Spec>
      <Spec label="Empty">
        <div className="wg-box">
          <NotesList notes={[]} text={{ title: "Notes so far", help: "You'll check and edit these at the end.", empty: "Skills you mention appear here, in your own words. Nothing is scored: they are notes, and you decide what stays.", newLabel: "NEW", noted: "Noted: {phrase}" }} />
        </div>
      </Spec>
      <Spec label="NoteChip: the four groups share size, border and fill; only the marker differs">
        <div className="wg-box wg-stack">
          <div className="wg-row">
            <NoteChip signalId="a" phrase="What I do" group="skill" refLabel="answer 1" />
            <NoteChip signalId="b" phrase="Tools" group="tool" refLabel="answer 1" />
            <NoteChip signalId="c" phrase="Know-how" group="knowledge" refLabel="answer 2" />
            <NoteChip signalId="d" phrase="Fields" group="domain" refLabel="answer 3" />
          </div>
          <div className="wg-row">
            <NoteChip signalId="e" phrase="Fresh note from the latest answer" group="skill" refLabel="answer 4" fresh newLabel="NEW" />
            <NoteChip signalId="f" phrase="Removed in the card" group="tool" plain removed />
            <NoteChip signalId="g" phrase="Ohjeiden ja tarkistuslistojen kirjoittaminen, myös vuoropuhelu asiakkaan kanssa" group="knowledge" refLabel="vastaus 5" />
          </div>
        </div>
      </Spec>
    </div>
  );
}

function ReasonSpecimens() {
  const variants: [ReasonVariant, typeof reasonText][] = [["feed", feedReason], ["organiser", reasonText], ["company", companyReason], ["intro", introReason]];
  return (
    <div className="wg-grid wg-wide">
      {variants.map(([v, t]) => (
        <Spec key={v} label={`variant="${v}"`}>
          <div className="wg-box">
            <ReasonList variant={v}>
              <ReasonLine
                variant={v}
                cardText={v === "feed" ? "Fixing barcode scanners" : "Repairs and resets handheld scanners on the warehouse floor."}
                cardKind={v === "feed" ? "phrase" : "rendering"}
                postingSentence="Vastaat käsiskannerien ja tulostimien arkitukesta varastolla."
                ownWords={v === "feed" ? { refLabel: "answer 2", text: "When a scanner freezes I'm the one they call." } : undefined}
                text={t}
              />
              <ReasonLine variant={v} cardText="Receives pallets and checks them against the delivery note." cardKind="rendering" postingSentence={null} escoLabel="receive incoming goods" text={t} />
            </ReasonList>
          </div>
        </Spec>
      ))}
      <Spec label="company, after both sides agreed (RevealedQuote)">
        <div className="wg-box">
          <ReasonList variant="company">
            <ReasonLine variant="company" cardText="Repairs and resets handheld scanners on the warehouse floor." cardKind="rendering" postingSentence="Vastaat käsiskannerien arkitukesta." revealedQuote="When a scanner freezes I'm the one they call." text={companyReason} />
          </ReasonList>
        </div>
      </Spec>
    </div>
  );
}

function PickSpecimens() {
  const [status, setStatus] = useState<"undecided" | "approved" | "removed">("undecided");
  const [dialog, setDialog] = useState(false);
  const [keys, setKeys] = useState(false);
  const dtext = { approve: "Approve", remove: "Remove", undo: "Undo", hint: "Decide this person on their own.", approved: "Approved", approvedNote: "Will be in today's list for this company.", removed: "Removed" };
  const reasons = (
    <ReasonList variant="organiser">
      <ReasonLine variant="organiser" cardText="Repairs and resets handheld scanners on the warehouse floor." cardKind="rendering" postingSentence="Vastaat käsiskannerien arkitukesta." text={reasonText} />
      <ReasonLine variant="organiser" cardText="Trains new colleagues on the floor." cardKind="rendering" postingSentence={null} escoLabel="train staff" text={reasonText} />
    </ReasonList>
  );
  const nm = <NotMentionedList items={[{ text: "Forklift licence", statutory: true }, { text: "Night shifts" }]} audience="organiser" text={{ ...notMentionedText, suffix: undefined }} />;
  const mk = (id: string, handle: string, st: "undecided" | "approved" | "removed", selected: boolean, extra?: { outOfDate?: boolean; origin?: string }) => (
    <OrganiserPickCard
      key={id}
      pickId={id}
      handle={handle}
      handleAria={`Nickname ${handle}`}
      summary="Keeps the warehouse moving, and shows new colleagues how the floor works."
      whyToday="Why today: not suggested to anyone for three days"
      syntheticLabel="Synthetic person"
      origin={extra?.origin}
      status={st}
      selected={selected}
      outOfDate={extra?.outOfDate ? "This pick was drafted against an older card. Approve is off until it is redrafted." : undefined}
      reasons={reasons}
      notMentioned={nm}
      controls={<DecisionControls status={st} reason={st === "removed" ? "Already in contact with this company." : undefined} approveDisabled={extra?.outOfDate} text={dtext} />}
    />
  );
  return (
    <>
      <div className="wg-grid wg-one">
        <Spec label="Undecided, selected (interactive: approve, remove, undo)">
          <OrganiserPickCard
            pickId="live"
            handle="Harbour-90"
            handleAria="Nickname Harbour-90"
            summary="Keeps the warehouse moving, and shows new colleagues how the floor works."
            whyToday="Why today: not suggested to anyone for three days"
            syntheticLabel="Synthetic person"
            status={status}
            selected
            reasons={reasons}
            notMentioned={nm}
            controls={<DecisionControls status={status} reason="Already in contact with this company." text={dtext} onApprove={() => setStatus("approved")} onRemove={() => setDialog(true)} onUndo={() => setStatus("undecided")} />}
          />
        </Spec>
        <Spec label="Approved, not selected (folds to one line)">{mk("p2", "Lantern-63", "approved", false)}</Spec>
        <Spec label="Removed, not selected (folds, keeps the reason visible)">{mk("p3", "Quartz-14", "removed", false)}</Spec>
        <Spec label="Out of date (Approve disabled with its message) and talent-initiated">{mk("p4", "Willow-08", "undecided", false, { outOfDate: true, origin: "This person asked to meet you" })}</Spec>
      </div>
      <div className="wg-grid">
        <Spec label="RemoveReasonDialog (nothing preselected, confirm disabled)">
          <RemoveReasonDialog inline title="Why remove Harbour-90 from today's list?" help="The reason goes to the audit log. It is never shown to the person as a judgement." reasons={removeReasons} noteLabel="Note (needed for Other)" confirmLabel="Remove Harbour-90" cancelLabel="Cancel" onCancel={() => {}} onConfirm={() => {}} />
        </Spec>
        <Spec label="RemoveReasonDialog, Other chosen without a note (still disabled)">
          <RemoveReasonDialog inline demoChosen="other" title="Why remove Harbour-90 from today's list?" help="The reason goes to the audit log. It is never shown to the person as a judgement." reasons={removeReasons} noteLabel="Note (needed for Other)" confirmLabel="Remove Harbour-90" cancelLabel="Cancel" onCancel={() => {}} onConfirm={() => {}} />
        </Spec>
        <Spec label="PublishBox, blocked">
          <PublishBox total={4} undecided={["Harbour-90", "Lantern-63", "Quartz-14"]} text={publishText} />
        </Spec>
        <Spec label="PublishBox, ready">
          <PublishBox total={4} undecided={[]} text={publishText} />
        </Spec>
        <Spec label="PublishBox, published">
          <PublishBox total={4} undecided={[]} published link="https://workespoo.example/c/demo-03" text={publishText} />
        </Spec>
        <Spec label="KeysBar and KeysOverlay">
          <div className="wg-stack">
            <KeysBar inline hints={keyHints} rule="One person at a time. No approve-all." />
            <Button onClick={() => setKeys(true)} kbd="?">Show all keys</Button>
            <KeysOverlay inline title="Every key acts on one person. No key acts on several." keys={[...keyHints, { key: "N", label: "Add a person to this need" }, { key: "Esc", label: "Close this window" }]} closeLabel="Close" onClose={() => {}} />
          </div>
        </Spec>
      </div>
      {dialog ? (
        <RemoveReasonDialog
          title="Why remove Harbour-90 from today's list?"
          help="The reason goes to the audit log. It is never shown to the person as a judgement."
          reasons={removeReasons}
          noteLabel="Note (needed for Other)"
          confirmLabel="Remove Harbour-90"
          cancelLabel="Cancel"
          onCancel={() => setDialog(false)}
          onConfirm={() => {
            setDialog(false);
            setStatus("removed");
          }}
        />
      ) : null}
      {keys ? <KeysOverlay title="Every key acts on one person. No key acts on several." keys={keyHints} closeLabel="Close" onClose={() => setKeys(false)} /> : null}
    </>
  );
}
const keyHints = [
  { key: "J K", label: "move" },
  { key: "A", label: "approve" },
  { key: "R", label: "remove, with a reason" },
  { key: "U", label: "undo" },
  { key: "P", label: "publish" },
  { key: "?", label: "all keys" },
];
const publishText = { status: "3 of 4 left to decide", ready: "Every suggestion has a decision", published: "Published", publish: "Publish to Demo company 03", helpLead: "Publish turns on when every suggestion has a decision. Decide", names: "Harbour-90, Lantern-63 and Quartz-14", helpTail: "first.", sent: "Sent to the company's private link." };

const introText = { sticker: "A company would like to meet you", whyTitle: "Why they were shown your card", waiting: "Waiting for your answer. Please answer by 4 Dec.", accept: "Accept", decline: "Decline", nameLabel: "Your name for this company", nameHelp: "Shown only to Demo company 11, for this meeting.", contactLabel: "How they can reach you", contactHelp: "An email address or a phone number.", share: "Share and accept", cancel: "Cancel", accepted: "You both said yes.", openAgenda: "Open your agenda", declined: "You declined. The company sees a neutral message, with no reason.", expired: "No answer before 4 Dec. The request has closed.", waitingOrganiser: "Waiting for an organiser" };
const introBase = { introId: "i1", heading: "Demo company 11 would like to meet you about Warehouse and scanner support.", lead: "Your name stays hidden unless you accept.", summary: "They need someone who can keep handheld devices running on a busy warehouse floor.", text: introText };

const companyText = { ask: "Ask to meet", askNote: "Their name stays hidden unless they accept.", confirmTitle: "Ask this person to meet?", confirmBody: "They will see your request and your need. They answer by 4 Dec. Their name stays hidden unless they accept.", send: "Send the request", cancel: "Cancel", withdraw: "Withdraw", accept: "Accept", decline: "Decline", declined: "The person chose not to meet this time.", both: "You both agreed to meet." };

function CompanySpecimens() {
  const reasons = (
    <ReasonList variant="company">
      <ReasonLine variant="company" cardText="Repairs and resets handheld scanners on the warehouse floor." cardKind="rendering" postingSentence="Vastaat käsiskannerien arkitukesta." text={companyReason} />
      <ReasonLine variant="company" cardText="Shows new colleagues how the floor works." cardKind="rendering" postingSentence="Perehdytät uudet työntekijät." text={companyReason} />
    </ReasonList>
  );
  const nm = <NotMentionedList items={[{ text: "Forklift licence", statutory: true }, { text: "Night shifts" }]} audience="company" text={{ ...notMentionedText, suffix: "Ask about it when you meet." }} />;
  const base = { handle: "Birch-27", handleAria: "Nickname Birch-27", syntheticLabel: "Synthetic person", summary: "Keeps the warehouse moving, and shows new colleagues how the floor works.", aiLabel: "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact.", aiTag: "AI", reasons, notMentioned: nm, text: companyText };
  return (
    <div className="wg-grid wg-wide">
      <Spec label="Open"><CompanyPickCard {...base} pickId="c1" intro={{ status: "none" }} /></Spec>
      <Spec label="Request sent"><CompanyPickCard {...base} handle="Lantern-63" handleAria="Nickname Lantern-63" pickId="c2" intro={{ status: "requested", waiting: "Request sent. Waiting for the person to answer (until 4 Dec)." }} /></Spec>
      <Spec label="Talent-initiated"><CompanyPickCard {...base} handle="Quartz-14" handleAria="Nickname Quartz-14" pickId="c3" askedToMeet="This person asked to meet you" intro={{ status: "talent" }} /></Spec>
      <Spec label="Declined and expired">
        <div className="wg-stack">
          <CompanyPickCard {...base} handle="Willow-08" handleAria="Nickname Willow-08" pickId="c4" notMentioned={undefined} intro={{ status: "declined" }} />
          <CompanyPickCard {...base} handle="Maple-52" handleAria="Nickname Maple-52" pickId="c5" notMentioned={undefined} intro={{ status: "expired", text: "No answer before 4 Dec. The request has closed." }} />
        </div>
      </Spec>
      <Spec label="Revealed (after both agreed)">
        <CompanyPickCard {...base} pickId="c6" reasons={<ReasonList variant="company"><ReasonLine variant="company" cardText="Repairs and resets handheld scanners on the warehouse floor." cardKind="rendering" postingSentence="Vastaat käsiskannerien arkitukesta." revealedQuote="When a scanner freezes I'm the one they call." text={companyReason} /></ReasonList>} intro={{ status: "revealed", name: "Aino Test-Virtanen (synthetic)", contact: "aino.synthetic@example.org", slot: { time: "Thu 26 Nov, 13:00", place: "Table 03" } }} />
      </Spec>
    </div>
  );
}

function RequirementSpecimens() {
  const qtext = { label: "A question about {requirement}", keep: "Keep as must-have", makeNice: "Make it nice-to-have", reword: "Change the wording", remove: "Remove it", rewordLabel: "New wording", save: "Save" };
  const question = { text: "Is fluent Finnish needed from the first day, or can it grow on the job?", why: "People in the pool often learned the language at work, and a short conversation rarely mentions it." };
  const ev = <PoolEvidenceLine kind="normal" speakTo={31} relevant={44} exclude={13} templates={evidenceTemplates} asOf="As of 09:14" />;
  return (
    <div className="wg-grid wg-wide">
      <Spec label="RequirementList, compact (rail)">
        <div className="we-need-box wg-box"><RequirementList mode="compact" requirements={requirements} text={requirementText} /></div>
      </Spec>
      <Spec label="RequirementList, full, editable (with question and evidence)">
        <RequirementList mode="full" editable requirements={requirements.slice(0, 3).map((r, i) => ({ ...r, extra: i === 0 ? <RequirementQuestion requirement={r.text} question={question} evidence={ev} text={qtext} /> : undefined }))} text={requirementText} />
      </Spec>
      <Spec label="RequirementQuestion, open"><RequirementQuestion requirement="Fluent working Finnish" question={question} evidence={ev} text={qtext} /></Spec>
      <Spec label="RequirementQuestion, narrow rail (one column)"><RequirementQuestion narrow requirement="Fluent working Finnish" question={question} evidence={ev} text={qtext} /></Spec>
      <Spec label="RequirementQuestion, answered"><RequirementQuestion requirement="Fluent working Finnish" question={question} evidence={ev} answered="You made it nice-to-have." text={qtext} /></Spec>
      <Spec label="RequirementQuestion, error"><RequirementQuestion requirement="Fluent working Finnish" question={question} error="We couldn't save your answer. It is not lost: try again." text={qtext} /></Spec>
      <Spec label="PoolEvidenceLine: language, statutory, whole pool">
        <div className="wg-stack">
          <PoolEvidenceLine kind="language" speakTo={22} relevant={44} exclude={22} selfDeclaredOnly={9} templates={evidenceTemplates} asOf="As of 09:14" />
          <PoolEvidenceLine kind="statutory" speakTo={19} relevant={44} templates={evidenceTemplates} asOf="As of 09:14" />
          <PoolEvidenceLine kind="wholePool" speakTo={6} relevant={0} wholePool={120} templates={evidenceTemplates} asOf="As of 09:14" />
        </div>
      </Spec>
    </div>
  );
}

function FormSpecimens() {
  const [consent, setConsent] = useState(false);
  return (
    <div className="wg-grid">
      <Spec label="Field: default, with hint, invalid, disabled">
        <div className="wg-box wg-stack">
          <Field label="Your name for this company" hint="Shown only to the company, for this meeting.">{(f) => <Input id={f.id} aria-describedby={f.describedBy} placeholder="For example Aino" />}</Field>
          <Field label="How they can reach you" hint="An email address or a phone number." error="Please add a way to reach you.">{(f) => <Input id={f.id} aria-describedby={f.describedBy} invalid={f.invalid} />}</Field>
          <Field label="Disabled field">{(f) => <Input id={f.id} disabled defaultValue="Locked until you approve" />}</Field>
          <Field label="Interview language">{(f) => <Select id={f.id}><option>English</option><option>Suomi</option><option>Svenska</option></Select>}</Field>
          <Field label="Add your CV text (optional)" hint="Paste the text. It is only used to ask better questions.">{(f) => <Textarea id={f.id} aria-describedby={f.describedBy} rows={3} />}</Field>
        </div>
      </Spec>
      <Spec label="ChoiceCard and Checkbox: consent always starts unchecked">
        <div className="wg-box wg-stack">
          <Checkbox label="I understand the interviewer is an AI" help="Required to start." checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="consent-interview" />
          <Checkbox label="The interviewer may listen to my voice" help="Optional. Audio is never stored." data-testid="consent-voice" />
          <div className="wg-row" style={{ alignItems: "stretch" }}>
            <div style={{ flex: "1 1 200px" }}><ChoiceCard type="radio" name="mode" title="Express" help="About four minutes" data-testid="mode-express" /></div>
            <div style={{ flex: "1 1 200px" }}><ChoiceCard type="radio" name="mode" title="Full" help="Up to ten minutes" data-testid="mode-full" /></div>
          </div>
          <ChoiceCard type="radio" name="x" title="Checked choice" help="Pine border and pine-50 fill" defaultChecked />
          <ChoiceCard type="radio" name="y" title="Disabled choice" help="60 % opacity" disabled />
        </div>
      </Spec>
      <Spec label="Buttons">
        <div className="wg-box wg-stack">
          <div className="wg-row"><Button variant="primary">Primary</Button><Button>Ghost</Button><Button variant="quiet">Quiet</Button><Button variant="danger">Danger</Button></div>
          <div className="wg-row"><Button variant="primary" size="lg">Start the conversation</Button><Button size="lg" icon="check">Large ghost</Button></div>
          <div className="wg-row"><Button variant="primary" disabled>Disabled primary</Button><Button disabled>Disabled ghost</Button></div>
          <div className="wg-row"><Button icon="check" kbd="A">Approve</Button><Button icon="minus" kbd="R">Remove</Button></div>
          <Button variant="primary" block>Ohjeiden ja tarkistuslistojen kirjoittaminen yhdellä pitkällä painikkeella</Button>
        </div>
      </Spec>
    </div>
  );
}

function ShellSpecimens() {
  return (
    <div className="wg-grid wg-one">
      <Spec label="audience=talent, current=card">
        <div className="wg-frame"><PageShell audience="talent" current="card" {...shellBase} nav={talentNav}><div style={{ padding: 20 }} className="we-page-body">Page content</div></PageShell></div>
      </Spec>
      <Spec label="audience=organiser (undecided badge, prototype pill)">
        <div className="wg-frame"><PageShell audience="organiser" current="review" {...shellBase} nav={organiserNav} prototypePill="Prototype: synthetic people, masked companies"><div style={{ padding: 20 }} className="we-page-body">Page content</div></PageShell></div>
      </Spec>
      <Spec label="audience=company (no nav, header slot)">
        <div className="wg-frame"><PageShell audience="company" {...shellBase} headerSlot={<span className="we-tag">For companies</span>}><div style={{ padding: 20 }} className="we-page-body">Page content</div></PageShell></div>
      </Spec>
    </div>
  );
}

function VoiceSpecimens() {
  const [typed, setTyped] = useState("");
  const [held, setHeld] = useState(false);
  return (
    <div className="wg-grid">
      <Spec label="HoldToTalk: ready, listening (hold it), disabled, done">
        <div className="wg-box wg-stack">
          <HoldToTalk state={held ? "listening" : "ready"} level={0.6} label={held ? "Release to send" : "Hold to talk"} onStart={() => setHeld(true)} onRelease={() => setHeld(false)} describedBy="wg-hint" />
          <p id="wg-hint" className="wg-note">In a noisy place, hold the button only while you speak.</p>
          <HoldToTalk state="listening" level={0.7} label="Release to send" />
          <HoldToTalk state="disabled" label="Hold to talk" />
          <HoldToTalk state="done" label="Check my notes" doneHref="#" />
          <div className="wg-row"><TypeInsteadButton label="Type instead" /><span className="wg-note">The 64 x 64 phone button.</span></div>
        </div>
      </Spec>
      <Spec label="TypeAnswer: empty, typing, sending, failed">
        <div className="wg-box wg-stack">
          <TypeAnswer id="t1" value={typed} onChange={setTyped} onSend={() => setTyped("")} placeholder="Write your answer" sendLabel="Send" sendingLabel="Sending…" />
          <TypeAnswer id="t2" value="I work mornings in a warehouse." onChange={() => {}} onSend={() => {}} placeholder="Write your answer" sendLabel="Send" sendingLabel="Sending…" />
          <TypeAnswer id="t3" value="I work mornings in a warehouse." sending onChange={() => {}} onSend={() => {}} placeholder="Write your answer" sendLabel="Send" sendingLabel="Sending…" />
          <TypeAnswer id="t4" value="I work mornings in a warehouse." onChange={() => {}} onSend={() => {}} error="We couldn't send that. Your words are still here." retryLabel="Try again" onRetry={() => {}} placeholder="Write your answer" sendLabel="Send" sendingLabel="Sending…" />
        </div>
      </Spec>
      <Spec label="InterviewerLine: static, speaking (62 % spoken), long">
        <div className="wg-box wg-cream wg-stack">
          <InterviewerLine label="Interviewer · AI" text="Tell me about a normal day at work last week." />
          <InterviewerLine label="Interviewer · AI" text="Tell me about a normal day at work last week. What did you do from start to finish?" spokenWords={9} />
          <InterviewerLine label="Interviewer · AI" text="Kerro tavallisesta työpäivästä viime viikolta. Mitä teit aamusta iltaan, ja mitkä asiat sujuivat sinulta erityisen hyvin tai joihin muut pyytävät sinulta apua? Kerro rauhassa, ei ole kiire." />
        </div>
      </Spec>
      <Spec label="WordsBox: empty, live, said">
        <div className="wg-stack">
          <WordsBox mode="empty" emptyText="Your words will show here as you speak. The sentences that become notes get marked." />
          <WordsBox mode="live" label="You, live" text="I work in a warehouse in Vantaa, mostly mornings and I take in the" />
          <WordsBox mode="said" label="You said · answer 2" hint="marked words became notes" answerNumber={2} sentences={["I work in a warehouse in Vantaa, mostly mornings.", "I take in the trucks and check every pallet against the note.", "Everything gets booked in the system on the handheld."]} cited={[1, 2]} />
        </div>
      </Spec>
      <Spec label="OwnWordsMark: resting and highlighted">
        <div className="wg-box we-page-body">
          <p>
            I work nights. <OwnWordsMark turn={1} sentence={1}>I fix the scanners when they freeze.</OwnWordsMark> It is fine. <OwnWordsMark turn={1} sentence={3} highlighted>The battery or the dock, mostly.</OwnWordsMark>
          </p>
        </div>
      </Spec>
      <Spec label="Transcript: empty and filled">
        <div className="wg-stack">
          <div className="wg-box"><Transcript turns={[]} text={transcriptText} /></div>
          <div className="wg-box" style={{ maxHeight: 420, overflow: "auto" }}>
            <Transcript
              turns={[
                { speaker: "ai", sentences: ["Tell me about a normal day at work last week."], label: "Interviewer · AI" },
                { speaker: "person", sentences: ["I work in a warehouse in Vantaa.", "I take in the trucks and check every pallet against the note."], label: "You · answer 1" },
                { speaker: "ai", sentences: ["You mentioned the scanners. How do you work out what is wrong with one?"], label: "Interviewer · AI" },
                { speaker: "person", sentences: ["When a scanner freezes I'm the one they call.", "Usually it is the battery or the dock."], label: "You · answer 2" },
              ]}
              cited={{ 1: [1], 3: [0, 1] }}
              onRemoveTurn={() => {}}
              text={transcriptText}
            />
          </div>
        </div>
      </Spec>
    </div>
  );
}
const transcriptText = { title: "Conversation", onlyYou: "Only you see your own words.", empty: "Nothing yet. When you answer, your words appear here.", remove: "Remove this answer", legendMarked: "Marked words", legendRest: "became notes." };

function JobsSpecimens() {
  return (
    <div className="wg-grid">
      <Spec label="Empty (no number, ghost tiles)"><JobsLit tiles={[]} text={jobsText} /></Spec>
      <Spec label="Settled, with the neutral +N new pill"><JobsLit count={31} delta={19} deltaLabel="+19 new" tiles={jobTiles.slice(0, 4).reverse()} text={jobsText} /></Spec>
      <Spec label="Error (no number)"><JobsLit tiles={[]} error text={jobsText} /></Spec>
      <Spec label="JobsMini (phone bar line)">
        <div className="wg-box wg-cream wg-stack">
          <div className="we-jobs-mini" style={{ display: "flex" }}><JobsMini count={31} delta={19} deltaLabel="+19 new" text={jobsText} /></div>
          <div className="we-jobs-mini" style={{ display: "flex" }}><JobsMini text={jobsText} /></div>
        </div>
      </Spec>
    </div>
  );
}

function CardSpecimens() {
  const [view, setView] = useState<"person" | "company">("person");
  const [edit, setEdit] = useState("Fixing barcode scanners");
  const common = {
    handle: "Birch-27", handleAria: "Nickname Birch-27",
    header: { kicker: "Signal Card", aiTag: "AI", aiLabel: "Summary written by AI from your own words", headline: "Keeps the warehouse moving, and the scanners running", summary: "Six years of receiving and checking goods.", readSummary: "Read the summary", hideSummary: "Hide the summary" },
    orderNote: "Notes are in the order you talked about them. Nothing here is scored.", groups: [{ key: "skill", title: "What I do", rows: signals.slice(0, 1) }],
    rowText, footer: ["Synthetic demo profile", "Draft · nobody sees this until you approve it"], stampLabel: "Approved by you", waitingText: "Preparing your notes…", waitingBadge: "Writing notes…", emptyText: "No notes yet. Add your own to get started.", errorText: "We couldn't prepare all your notes. You can add your own and approve when ready.",
  };
  const aText = { sticker: "Yours to approve", title: "Approve your card", help: "Your card is a draft. Nobody sees it until you approve it.", approve: "Approve my card", preparing: "Preparing company view…", empty: "Keep at least one note to approve your card.", approved: "Approved. You can change your card at any time.", goToMatches: "See jobs that fit your card →" };
  const pText = { title: "Can Espoo suggest you to companies?", body: "If you say yes, an organiser may suggest your card to a company.", yes: "Yes, suggest me", yesHelp: "A person checks every suggestion.", no: "Not now", noHelp: "Your card stays with you.", locked: "Approve your card first. Nothing is chosen for you.", statusIn: "You are in the pool. You can leave at any time.", statusOut: "You are not in the pool.", leave: "Leave the pool", leaveTitle: "Leave the pool?", leaveBody: "Nobody will suggest your card any more.", leaveConfirm: "Leave the pool", cancel: "Cancel" };
  return (
    <>
      <div className="wg-grid wg-wide">
        <Spec label="SignalCard: waiting"><SignalCard {...common} state="waiting" /></Spec>
        <Spec label="SignalCard: empty"><SignalCard {...common} state="empty" /></Spec>
        <Spec label="SignalCard: error"><SignalCard {...common} state="error" /></Spec>
        <Spec label="SignalCard: approved (stamp)"><SignalCard {...common} approved /></Spec>
      </div>
      <h3 className="wg-sub">SkillRow</h3>
      <div className="wg-grid wg-wide">
        <Spec label="Default (own words, ESCO EN · FI, AI wording)"><div className="wg-box"><SkillRow signal={signals[1]} text={rowText} /></div></Spec>
        <Spec label="Editing, with the calm line">
          <div className="wg-box"><SkillRow signal={signals[0]} text={rowText} editing={{ draft: edit, onDraftChange: setEdit, onSave: () => {}, onCancel: () => {}, sensitiveWarning: /health|age/i.test(edit) ? "Companies will see this. You don't need to share it." : "Companies will see this. You don't need to share it." }} /></div>
        </Spec>
        <Spec label="Removed, with Undo"><div className="wg-box"><SkillRow signal={{ ...signals[0], removed: true }} text={rowText} /></div></Spec>
        <Spec label="Added by you, no ESCO match"><div className="wg-box"><SkillRow signal={signals[4]} text={rowText} /></div></Spec>
        <Spec label="No ESCO match, stale rendering"><div className="wg-box"><SkillRow signal={{ ...signals[2], esco: null, rendering: null }} text={rowText} /></div></Spec>
        <Spec label="Company view (no quotes, no actions)"><div className="wg-box"><SkillRow signal={signals[1]} view="company" text={rowText} /></div></Spec>
      </div>
      <h3 className="wg-sub">Side column</h3>
      <div className="wg-grid">
        <Spec label="CompanyViewSwitch">
          <div className="wg-stack">
            <CompanyViewSwitch value={view} onChange={setView} groupLabel="Preview" personLabel="My view" companyLabel="What companies see" />
            <CompanyViewSwitch value="company" onChange={() => {}} groupLabel="Preview" personLabel="Oma näkymä" companyLabel="Mitä yritykset näkevät" />
          </div>
        </Spec>
        <Spec label="ApproveBox: ready"><ApproveBox state="ready" tally="7 notes kept · 1 removed" text={aText} /></Spec>
        <Spec label="ApproveBox: preparing"><ApproveBox state="preparing" tally="7 notes kept · 1 removed" text={aText} /></Spec>
        <Spec label="ApproveBox: empty"><ApproveBox state="empty" tally="0 notes kept · 8 removed" text={aText} /></Spec>
        <Spec label="ApproveBox: approved"><ApproveBox state="approved" text={aText} /></Spec>
        <Spec label="PoolConsent: locked"><PoolConsent approved={false} inPool={null} text={pText} /></Spec>
        <Spec label="PoolConsent: open, nothing chosen"><PoolConsent approved inPool={null} text={pText} /></Spec>
        <Spec label="PoolConsent: chosen"><PoolConsent approved inPool text={pText} /></Spec>
        <Spec label="DataControls">
          <DataControls purgeNotice="This is a live demo session. Everything is deleted automatically after 24 hours." text={{ title: "Your data", body: "Download everything WorkEspoo has about you, or delete it.", export: "Download my data", delete: "Delete everything", confirmTitle: "Delete everything?", confirmBody: "Your card, your answers and your choices are deleted for good.", confirmYes: "Yes, delete everything", cancel: "Cancel", deleted: "Everything has been deleted." }} />
        </Spec>
      </div>
    </>
  );
}

function SmallPieces() {
  return (
    <div className="wg-grid">
      <Spec label="PersonHandle md and sm, SyntheticTag">
        <div className="wg-box wg-stack">
          <div className="wg-row"><PersonHandle handle="Birch-27" ariaLabel="Nickname Birch-27" /><SyntheticTag>Synthetic person</SyntheticTag></div>
          <div className="wg-row"><PersonHandle handle="Harbour-90" size="sm" ariaLabel="Nickname Harbour-90" /><PersonHandle handle="Lantern-63" size="sm" ariaLabel="Nickname Lantern-63" /><SyntheticTag>Synthetic person</SyntheticTag></div>
          <p className="wg-note">The same neutral diamond for everyone. No initials, avatars, colours per person or flags.</p>
        </div>
      </Spec>
      <Spec label="Sticker, Tag, AI tag, Slot, Cheer mark">
        <div className="wg-box wg-stack">
          <div className="wg-row"><Sticker>Real open jobs</Sticker><Sticker>Yours to approve</Sticker><Sticker flat>Flat sticker</Sticker></div>
          <div className="wg-row"><Tag>Warehouse</Tag><Tag>On site</Tag><AiTag>AI</AiTag><AiTag mini>AI</AiTag></div>
          <Slot time="Thu 26 Nov, 13:00" place="Table 03" />
          <div className="wg-row"><span style={{ width: 48, height: 48, display: "inline-flex" }}><CheerMark /></span><Icon name="mic" className="wg-icon" /></div>
        </div>
      </Spec>
      <Spec label="Toast, Dialog (inline)">
        <div className="wg-stack">
          <div style={{ position: "relative", height: 70 }}><Toast message="Your card is saved." className="wg-toast" /></div>
          <Dialog inline title="Stop the interview?" actions={<><Button>Keep talking</Button><Button variant="primary">Stop and review my notes</Button></>}><p>You can still review the notes made so far.</p></Dialog>
        </div>
      </Spec>
      <Spec label="Banners">
        <div className="wg-stack">
          <AiDisclosure tag="AI">You&apos;re talking with an AI. It takes notes; you review and approve them at the end.</AiDisclosure>
          <MaskedDemoBanner lead="Demo company 03." text="Based on a real public posting. The employer's name is hidden. The people below are synthetic." prototypeLine="WorkEspoo is a hackathon prototype, not an official City of Espoo service." />
          <SeededDemoBanner>This history was seeded for the demo. Decisions from today are live.</SeededDemoBanner>
          <CompanyPreviewBanner>This is exactly what a company sees. Your own words, your language and whether you spoke or typed stay with you until you both say yes.</CompanyPreviewBanner>
          <PurgeNotice>This is a live demo session. Everything is deleted automatically after 24 hours.</PurgeNotice>
          <div className="wg-row"><OrganiserPreview>Organiser preview</OrganiserPreview></div>
          <PrototypeLine>WorkEspoo is a hackathon prototype for Junction 2026. Not an official City of Espoo service.</PrototypeLine>
        </div>
      </Spec>
      <Spec label="EmptyState (chips, tiles, rows), LoadingState, ErrorState">
        <div className="wg-stack">
          <EmptyState ghostShape="chips" message="Skills you mention appear here, in your own words." />
          <EmptyState ghostShape="tiles" message="Real open jobs light up here as you talk." />
          <EmptyState ghostShape="rows" message="No events yet." />
          <LoadingState message="Preparing company view…" badgeLabel="Writing notes…" />
          <LoadingState message="Loading your matches…" />
          <ErrorState message="Job matches are not available right now. Your card is saved." action={{ label: "Try again" }} />
        </div>
      </Spec>
    </div>
  );
}

function MatchSpecimens() {
  const feedReasons = (
    <ReasonList variant="feed">
      <ReasonLine variant="feed" cardText="Fixing barcode scanners" cardKind="phrase" postingSentence="Vastaat käsiskannerien ja tulostimien arkitukesta varastolla." ownWords={{ refLabel: "answer 2", text: "When a scanner freezes I'm the one they call." }} text={feedReason} />
      <ReasonLine variant="feed" cardText="Receiving and checking deliveries" cardKind="phrase" postingSentence={null} escoLabel="receive incoming goods" text={feedReason} />
    </ReasonList>
  );
  const nmText = { ...notMentionedText, label: "In your conversation", suffix: "You can still apply." };
  return (
    <>
      <div className="wg-grid wg-wide">
        <Spec label="JobPostingCard">
          <JobPostingCard jobId="j1" title="Scanner and device support, warehouse" employer="Nordic Parcel Demo Oy" place="Vantaa, Hakkila" closes="Closes 12 Dec" url="https://example.org/posting" source="Source: Työmarkkinatori" openLabel="Open the posting" reasons={feedReasons} notMentioned={<NotMentionedList items={[{ text: "Forklift licence", statutory: true }, { text: "Experience of night shifts" }]} audience="person" text={nmText} />} />
        </Spec>
        <Spec label="JobPostingCard: no requirements read yet">
          <JobPostingCard jobId="j2" title="Receiving clerk, night shift" employer="Espoo Logistics Hub (demo)" place="Espoo, Leppävaara" closes="Closes 20 Dec" url="https://example.org/posting2" source="Source: Työmarkkinatori" openLabel="Open the posting" reasons={feedReasons} notMentioned={<NotMentionedList items={null} audience="person" text={nmText} />} />
        </Spec>
        <Spec label="IntroRequest: pending"><IntroRequest {...introBase} status="pending" reasons={<ReasonList variant="intro"><ReasonLine variant="intro" cardText="Fixing barcode scanners" cardKind="phrase" postingSentence="Vastaat käsiskannerien arkitukesta." text={introReason} /></ReasonList>} /></Spec>
        <Spec label="IntroRequest: accept form"><IntroRequest {...introBase} status="pending" initialForm /></Spec>
        <Spec label="IntroRequest: accepted"><IntroRequest {...introBase} status="accepted" slot={{ time: "Thu 26 Nov, 13:00", place: "Table 11" }} acceptedNote="Demo company 11 now sees your name and your own words on your card." agendaHref="#" /></Spec>
        <Spec label="IntroRequest: declined, expired, waiting for organiser">
          <div className="wg-stack">
            <IntroRequest {...introBase} introId="i2" status="declined" />
            <IntroRequest {...introBase} introId="i3" status="expired" />
            <IntroRequest {...introBase} introId="i4" status="waiting" />
          </div>
        </Spec>
      </div>
      <h3 className="wg-sub">NotMentionedList</h3>
      <div className="wg-grid">
        <Spec label="person"><NotMentionedList audience="person" items={[{ text: "Forklift licence", statutory: true }, { text: "Experience of night shifts" }]} text={nmText} /></Spec>
        <Spec label="organiser"><NotMentionedList audience="organiser" items={[{ text: "Forklift licence", statutory: true }]} text={{ ...notMentionedText, suffix: undefined }} /></Spec>
        <Spec label="company"><NotMentionedList audience="company" items={[{ text: "Experience of night shifts" }]} text={{ ...notMentionedText, suffix: "Ask about it when you meet." }} /></Spec>
      </div>
    </>
  );
}

export function Gallery() {
  const [presenter, setPresenter] = useState(false);
  const toc: [string, string][] = [
    ["tokens", "Tokens"], ["shell", "Page shell"], ["mascot", "Interviewer mascot"], ["voice", "Voice, words, transcript"], ["notes", "Notes"], ["jobs", "Jobs lit"], ["card", "Signal Card"],
    ["matches", "Matches and intros"], ["reasons", "Reason lines"], ["organiser", "Organiser review"], ["company", "Company pages"], ["forms", "Buttons and forms"], ["small", "Small pieces and states"],
    ["room", "Assembled: interview room"], ["cardpage", "Assembled: Signal Card page"],
  ];
  return (
    <div className="wg we-page-body">
      <div className="wg-wrap">
        <h1>WorkEspoo component kit</h1>
        <p className="wg-lead">Every component in every state, with synthetic content. The kit has no text of its own: the English here is sample text a screen would pass in. Nothing on this page scores, ranks or levels a person.</p>
        <ul className="wg-index">
          {toc.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`}>{label}</a>
            </li>
          ))}
        </ul>

        <Section id="tokens" title="Tokens" note="Colour, type, radii and shadows from docs/design/DESIGN.md. They live in src/app/globals.css and are wired into Tailwind's theme, so the shadcn primitives pick them up.">
          <div className="wg-swatches">
            {COLOURS.map(([name, hex, role]) => (
              <div className="wg-swatch" key={name}>
                <i style={{ background: `var(--${name})` }} />
                <div>
                  <b>{name}</b>
                  <span>
                    {hex} · {role}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="wg-type">
            {[
              ["display · Fredoka 600 40", "Your Signal Card", "var(--font-display)", 40, 600],
              ["interviewer · Fredoka 500 30", "Tell me about a normal day at work.", "var(--font-display)", 30, 500],
              ["h2 · Fredoka 500 26", "Open jobs that fit your card", "var(--font-display)", 26, 500],
              ["h3 · Fredoka 500 20", "Scanner and device support", "var(--font-display)", 20, 500],
              ["body-lg · Inter 18", "When a scanner freezes I'm the one they call.", "var(--font-body)", 18, 400],
              ["body · Inter 16", "Notes are in the order you talked about them.", "var(--font-body)", 16, 400],
              ["fine · Inter 13", "Not mentioned does not mean missing.", "var(--font-body)", 13, 400],
            ].map(([k, s, f, size, w]) => (
              <div key={k as string}>
                <small>{k}</small>
                <span style={{ fontFamily: f as string, fontSize: size as number, fontWeight: w as number, lineHeight: 1.25 }}>{s}</span>
              </div>
            ))}
          </div>
          <div className="wg-shadows">
            <div style={{ boxShadow: "var(--shadow-ink)" }}>shadow-ink 5px</div>
            <div style={{ boxShadow: "var(--shadow-ink-sm)" }}>shadow-ink-sm 3px</div>
            <div style={{ boxShadow: "var(--press)", borderRadius: 999 }}>press 0 5px 0</div>
            <div style={{ borderRadius: 6 }}>r-xs 6</div>
            <div style={{ borderRadius: 10 }}>r-sm 10</div>
            <div style={{ borderRadius: 16 }}>r-md 16</div>
            <div style={{ borderRadius: 24 }}>r-lg 24</div>
            <div style={{ borderRadius: 28 }}>r-xl 28</div>
          </div>
        </Section>

        <Section id="shell" title="PageShell" note="Top bar, logo, nav for the audience, language switcher, slots. On phones the nav moves behind a 44 px Menu button; languages stay visible.">
          <ShellSpecimens />
        </Section>
        <Section id="mascot" title="InterviewerMascot" note="The brand Cheer W exactly, with no face in any state. State shows by shape plus a worded badge. Reduced motion draws static shapes.">
          <MascotSpecimens />
        </Section>
        <Section id="voice" title="Voice controls, words, transcript">
          <VoiceSpecimens />
        </Section>
        <Section id="notes" title="NoteChip and NotesList" note="Only items that are new since the last render animate. The first render never does.">
          <NotesSpecimen />
        </Section>
        <Section id="jobs" title="JobsLit" note="A count of postings, never of people. Empty shows a sentence and ghost tiles, never a bare 0.">
          <JobsSpecimens />
        </Section>
        <Section id="card" title="SignalCard, SkillRow and the side column" note="The person's own words and the AI wording are separate containers: only the words are quoted.">
          <CardSpecimens />
        </Section>
        <Section id="matches" title="Job postings and intro requests">
          <MatchSpecimens />
        </Section>
        <Section id="reasons" title="ReasonLine" note="The card side is never in quote marks. Posting sentences and the person's own words are.">
          <ReasonSpecimens />
        </Section>
        <Section id="organiser" title="Organiser review queue" note="Approve and Remove are identical ghost buttons. No approve-all. Publish names who is still undecided.">
          <PickSpecimens />
        </Section>
        <Section id="company" title="Company pages: requirements, questions, picks">
          <RequirementSpecimens />
          <h3 className="wg-sub">Company picks</h3>
          <CompanySpecimens />
        </Section>
        <Section id="forms" title="Buttons and form fields">
          <FormSpecimens />
        </Section>
        <Section id="small" title="Small pieces, banners and states">
          <SmallPieces />
        </Section>

        <Section id="room" title="Assembled: the interview room" note="Built only from kit components. Hold the talk button, release, and watch the marked words fly into the notes while the jobs count rises. Copy this composition.">
          <div className="wg-tools">
            <button type="button" aria-pressed={presenter} onClick={() => setPresenter((v) => !v)}>
              Presenter mode
            </button>
          </div>
          <InterviewDemo key={String(presenter)} presenter={presenter} />
        </Section>
        <Section id="cardpage" title="Assembled: the Signal Card page" note="Built only from kit components. Remove a note and undo it, edit one, preview what companies see, then approve. Pool consent stays locked until then.">
          <CardDemo />
        </Section>
      </div>
    </div>
  );
}
