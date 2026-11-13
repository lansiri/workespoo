import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AiDisclosure, ApproveBox, Button, CompanyPickCard, CompanyViewSwitch, DataControls, DecisionControls, Dialog, EmptyState, ErrorState, HoldToTalk,
  IntroRequest, InterviewerLine, JobPostingCard, JobsLit, KeysBar, LoadingState, MaskedDemoBanner, NotMentionedList, OrganiserPickCard,
  OwnWordsMark, PageShell, PersonHandle, PoolConsent, PoolEvidenceLine, PublishBox, ReasonLine, ReasonList, RequirementList, RequirementQuestion,
  SignalCard, SkillRow, Slot, Sticker, SyntheticTag, Tag, Toast, Transcript, TypeAnswer, WordsBox, Field, Input, ChoiceCard,
  type ReasonText, type SkillRowData, type SkillRowText,
} from "./index";

const reasonText: ReasonText = { cardLabel: "From the card · AI wording", postingLabel: "From the posting", mentions: "Mentions {label}", seeOwnWords: "See your own words", hideOwnWords: "Hide", yourWords: "Your words", revealedLabel: "In their own words", revealedNote: "Shown to you after you both agreed" };
const rowText: SkillRowText = { edit: "Edit", remove: "Remove", undo: "Undo", removedNote: "Removed.", escoLabel: "ESCO", noEsco: "No ESCO match.", yourWords: "Your words", shownAs: "Shown to companies as", aiTag: "AI", addedByYou: "Added by you", stale: "Preparing company view…", editAria: "Edit {phrase}", removeAria: "Remove {phrase}", inputLabel: "Note", save: "Save", cancel: "Cancel" };
const signal: SkillRowData = { id: "s1", phrase: "Fixing barcode scanners", group: "skill", esco: { en: "use scanning equipment", fi: "skannauslaitteiden käyttö" }, addedBy: "ai", rendering: "Repairs and resets handheld scanners on the warehouse floor.", quotes: [{ refLabel: "Answer 2", text: "I'm the one who fixes the scanners when they freeze." }] };
const notMentionedText = { label: "Not mentioned in the conversation", statutory: "(checked by the employer at hiring)", fine: "Not mentioned does not mean missing.", suffix: "Ask about it when you meet.", notRead: "Requirements not read yet." };

const stripTags = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("kit renders with required props", () => {
  it("renders the small pieces", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain("we-btn-ghost");
    expect(renderToStaticMarkup(<Button variant="primary" size="lg" block kbd="P">Publish</Button>)).toContain("we-btn-lg");
    expect(renderToStaticMarkup(<Sticker>Real open jobs</Sticker>)).toContain("Real open jobs");
    expect(renderToStaticMarkup(<Tag>Espoo</Tag>)).toContain("we-tag");
    expect(renderToStaticMarkup(<Slot time="Thu 26 Nov, 13:00" place="Table 03" />)).toContain("Table 03");
    expect(renderToStaticMarkup(<Toast message="Saved" />)).toContain('role="status"');
    expect(renderToStaticMarkup(<SyntheticTag>Synthetic person</SyntheticTag>)).toContain("Synthetic person");
    expect(renderToStaticMarkup(<Dialog title="Stop?" inline>body</Dialog>)).toContain('role="dialog"');
    expect(renderToStaticMarkup(<EmptyState message="Nothing yet." ghostShape="rows" />)).toContain("Nothing yet.");
    expect(renderToStaticMarkup(<LoadingState message="Preparing…" badgeLabel="Writing" />)).toContain("Preparing…");
    expect(renderToStaticMarkup(<ErrorState message="Not available." action={{ label: "Try again" }} />)).toContain('role="alert"');
    expect(renderToStaticMarkup(<Field label="Name" hint="h" error="e">{(f) => <Input id={f.id} invalid={f.invalid} />}</Field>)).toContain('aria-invalid="true"');
    expect(renderToStaticMarkup(<ChoiceCard title="Yes" />)).not.toContain("checked");
  });

  it("renders the page shell with accessible nav and language links", () => {
    const html = renderToStaticMarkup(
      <PageShell audience="talent" current="card" logoLabel="WorkEspoo" wordmark="WorkEspoo" navLabel="Main" nav={[{ key: "card", label: "My card", href: "/card" }, { key: "matches", label: "My matches", href: "/matches" }]} languageLabel="Language" languages={[{ code: "en", label: "English", href: "?lang=en", current: true }, { code: "fi", label: "Suomi", href: "?lang=fi", current: false }, { code: "sv", label: "Svenska", href: "?lang=sv", current: false }]} menuLabel="Menu">
        <p>content</p>
      </PageShell>,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('data-testid="site-logo"');
    expect(html).toContain('data-testid="lang-fi"');
    expect(html).toContain('aria-label="Menu"');
  });

  it("renders the interview pieces", () => {
    expect(renderToStaticMarkup(<InterviewerLine label="Interviewer · AI" text="What did you do last week?" spokenWords={2} />)).toContain("we-unspoken");
    expect(renderToStaticMarkup(<InterviewerLine label="Interviewer · AI" text="What did you do last week?" />)).not.toContain("we-unspoken");
    expect(renderToStaticMarkup(<WordsBox mode="empty" emptyText="Your words show here." />)).toContain("Your words show here.");
    expect(renderToStaticMarkup(<WordsBox mode="live" label="You, live" text="I work in a ware" />)).toContain('data-testid="voice-partial"');
    const said = renderToStaticMarkup(<WordsBox mode="said" label="You said · answer 2" hint="marked words became notes" answerNumber={2} sentences={["I work nights.", "I fix the scanners.", "It is fine."]} cited={[1]} sweep />);
    expect(said.match(/we-mk/g)).toHaveLength(1);
    expect(said).toContain("we-sweep");
    expect(renderToStaticMarkup(<OwnWordsMark turn={1} sentence={0} highlighted>x</OwnWordsMark>)).toContain("we-hl");
    expect(renderToStaticMarkup(<HoldToTalk state="ready" label="Hold to talk" />)).toContain('data-testid="talk-button"');
    expect(renderToStaticMarkup(<HoldToTalk state="listening" label="Release to send" level={0.5} />)).toContain("we-lvl");
    expect(renderToStaticMarkup(<HoldToTalk state="done" label="Check my notes" doneHref="/card" />)).toContain('href="/card"');
    expect(renderToStaticMarkup(<TypeAnswer value="" onChange={() => {}} onSend={() => {}} placeholder="Write your answer" sendLabel="Send" sendingLabel="Sending…" />)).toContain("disabled");
    expect(renderToStaticMarkup(<AiDisclosure tag="AI">You&apos;re talking with an AI.</AiDisclosure>)).toContain("AI");
    const t = renderToStaticMarkup(<Transcript turns={[{ speaker: "ai", sentences: ["Hello."], label: "Interviewer · AI" }, { speaker: "person", sentences: ["I fix scanners."], label: "You · answer 1" }]} cited={{ 1: [0] }} onRemoveTurn={() => {}} text={{ title: "Conversation", onlyYou: "Only you see your own words.", empty: "Nothing yet.", remove: "Remove this answer", legendMarked: "Marked words", legendRest: "became notes." }} />);
    expect(t).toContain('data-testid="turn-remove"');
    expect(t).toContain("we-mk");
  });

  it("renders the jobs board without a number before the first note, and never a person count", () => {
    const text = { sticker: "Real open jobs", countLabel: "open jobs in Espoo mention these skills", emptyLine: "Real open jobs light up here as you talk.", source: "Source: Työmarkkinatori", mentionsLabel: "mentions:", more: "More in your job feed.", error: "Job matches are not available right now.", mini: "open jobs mention these", miniEmpty: "Jobs light up as you talk" };
    const empty = renderToStaticMarkup(<JobsLit tiles={[]} text={text} />);
    expect(empty).not.toContain("jobs-lit-count");
    expect(empty).toContain(text.emptyLine);
    const filled = renderToStaticMarkup(<JobsLit count={29} delta={29} deltaLabel="+29 new" tiles={[{ id: "j1", title: "Warehouse and scanner support", employer: "Demo employer", place: "Espoo", mentions: "scanning" }]} text={text} />);
    expect(filled).toContain('data-testid="jobs-lit-count"');
    expect(filled).toContain("mentions: scanning");
  });
});

describe("signal card family", () => {
  const props = {
    handle: "Birch-27", handleAria: "Nickname Birch-27",
    header: { kicker: "Signal Card", aiTag: "AI", aiLabel: "Summary written by AI from your own words", headline: "Keeps the warehouse moving and the scanners running", summary: "Two sentences.", readSummary: "Read the summary", hideSummary: "Hide the summary" },
    orderNote: "Notes are in the order you talked about them. Nothing here is scored.",
    groups: [{ key: "skill", title: "What I do", rows: [signal, { ...signal, id: "s2", phrase: "Removed one", removed: true }] }],
    rowText, footer: ["Synthetic demo profile"], stampLabel: "Approved by you", waitingText: "Preparing your notes…", waitingBadge: "Writing", emptyText: "No notes yet.", errorText: "We couldn't prepare all your notes.",
  };
  it("renders the person view with quotes and actions, and the company view without them", () => {
    const person = renderToStaticMarkup(<SignalCard {...props} approved />);
    expect(person).toContain('data-testid="signal-quote"');
    expect(person).toContain('data-testid="signal-edit"');
    expect(person).toContain('data-testid="removed-signal"');
    expect(person).toContain('data-testid="card-approved-stamp"');
    const company = renderToStaticMarkup(<SignalCard {...props} view="company" approved />);
    expect(company).not.toContain("signal-quote");
    expect(company).not.toContain("I'm the one who fixes the scanners");
    expect(company).not.toContain("signal-edit");
    expect(company).not.toContain("removed-signal");
    expect(company).not.toContain("card-approved-stamp");
    expect(company).toContain("Repairs and resets handheld scanners");
  });
  it("renders waiting, empty and error states", () => {
    expect(renderToStaticMarkup(<SignalCard {...props} state="waiting" />)).toContain('data-testid="card-waiting"');
    expect(renderToStaticMarkup(<SignalCard {...props} state="empty" />)).toContain('data-testid="card-empty"');
    expect(renderToStaticMarkup(<SignalCard {...props} state="error" />)).toContain('data-testid="card-error"');
  });
  it("keeps the person's words and the AI wording in separate containers, only the words quoted", () => {
    const html = renderToStaticMarkup(<SkillRow signal={signal} text={rowText} />);
    expect(html).toContain("we-quote");
    expect(html).toContain("we-rendering");
    expect(html).not.toMatch(/we-rendering[^]*?<q>/);
  });
  it("renders a removed row with undo and a stale rendering", () => {
    expect(renderToStaticMarkup(<SkillRow signal={{ ...signal, removed: true }} text={rowText} />)).toContain('data-testid="signal-undo"');
    expect(renderToStaticMarkup(<SkillRow signal={{ ...signal, rendering: null }} text={rowText} />)).toContain("Preparing company view…");
  });
  it("starts consent unselected and locked until approved", () => {
    const text = { title: "Can Espoo suggest you to companies?", body: "b", yes: "Yes, suggest me", yesHelp: "h", no: "Not now", noHelp: "h", locked: "Approve your card first.", statusIn: "in", statusOut: "out", leave: "Leave the pool", leaveTitle: "t", leaveBody: "b", leaveConfirm: "c", cancel: "Cancel" };
    const html = renderToStaticMarkup(<PoolConsent approved={false} inPool={null} text={text} />);
    expect(html).not.toContain("checked");
    expect(html.match(/disabled/g)).toHaveLength(2);
    expect(html).toContain("Approve your card first.");
    const open = renderToStaticMarkup(<PoolConsent approved inPool={null} text={text} />);
    expect(open).not.toContain("checked");
    expect(open).not.toContain("disabled");
  });
  it("renders the approve box states and the view switch and data controls", () => {
    const text = { sticker: "Yours to approve", title: "Approve your card", help: "help", approve: "Approve my card", preparing: "Preparing company view…", empty: "Nothing kept.", approved: "Approved.", goToMatches: "See jobs" };
    expect(renderToStaticMarkup(<ApproveBox state="ready" tally="7 notes kept · 1 removed" text={text} />)).toContain('data-testid="approve-card"');
    expect(renderToStaticMarkup(<ApproveBox state="preparing" text={text} />)).toContain("disabled");
    expect(renderToStaticMarkup(<ApproveBox state="empty" text={text} />)).toContain("Nothing kept.");
    expect(renderToStaticMarkup(<ApproveBox state="approved" text={text} />)).toContain('data-testid="go-to-matches"');
    expect(renderToStaticMarkup(<CompanyViewSwitch value="company" onChange={() => {}} groupLabel="View" personLabel="My view" companyLabel="What companies see" />)).toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(<DataControls text={{ title: "Your data", body: "b", export: "Download", delete: "Delete everything", confirmTitle: "t", confirmBody: "b", confirmYes: "Yes", cancel: "Cancel", deleted: "Gone" }} purgeNotice="Purged in 24 hours." />)).toContain('data-testid="purge-notice"');
  });
});

describe("matches, picks and the organiser", () => {
  const nm = <NotMentionedList items={[{ text: "Forklift licence", statutory: true }, { text: "Night shifts" }]} audience="organiser" text={notMentionedText} />;
  it("renders reasons in every variant, the card side never quoted", () => {
    for (const variant of ["feed", "organiser", "company", "intro"] as const) {
      const html = renderToStaticMarkup(<ul><ReasonLine variant={variant} cardText="Fixing barcode scanners" cardKind="phrase" postingSentence="You will troubleshoot handheld scanners." text={reasonText} /></ul>);
      expect(html).toContain("You will troubleshoot handheld scanners.");
      expect(html).not.toContain("<q>Fixing barcode scanners");
    }
    expect(renderToStaticMarkup(<ul><ReasonLine variant="feed" cardText="Fixing barcode scanners" cardKind="phrase" postingSentence={null} escoLabel="use scanning equipment" text={reasonText} /></ul>)).toContain("Mentions use scanning equipment");
    expect(renderToStaticMarkup(<ul><ReasonLine variant="company" cardText="x" cardKind="rendering" revealedQuote="I fix them." text={reasonText} /></ul>)).toContain('data-testid="revealed-quote"');
  });
  it("renders not-mentioned without any alarming word or count", () => {
    const html = stripTags(renderToStaticMarkup(nm));
    expect(html).not.toMatch(/missing\b(?! ?\.)|lacking|\bgap\b|fails|\bmust\b/i);
    expect(html).toContain("Not mentioned does not mean missing.");
    expect(stripTags(renderToStaticMarkup(<NotMentionedList items={null} audience="person" text={notMentionedText} />))).toContain("Requirements not read yet.");
  });
  it("renders the job posting card with source and link", () => {
    const html = renderToStaticMarkup(<JobPostingCard jobId="j1" title="Warehouse and scanner support" employer="Demo employer" place="Leppävaara" closes="Closes 12 Dec" url="https://example.org/job" source="Source: Työmarkkinatori" openLabel="Open the posting" />);
    expect(html).toContain('data-job-id="j1"');
    expect(html).toContain('data-testid="source-attribution"');
    expect(html).toContain('data-testid="job-link"');
  });
  it("renders every intro status", () => {
    const text = { sticker: "A company would like to meet you", whyTitle: "Why they were shown your card", waiting: "Waiting for your answer.", accept: "Accept", decline: "Decline", nameLabel: "Your name", nameHelp: "h", contactLabel: "Contact", contactHelp: "h", share: "Share and accept", cancel: "Cancel", accepted: "You both said yes.", openAgenda: "Open your agenda", declined: "You declined.", expired: "Closed.", waitingOrganiser: "Waiting for an organiser" };
    const base = { introId: "i1", heading: "Demo company 11 would like to meet you.", lead: "Your name stays hidden unless you accept.", text };
    const pending = renderToStaticMarkup(<IntroRequest {...base} status="pending" />);
    expect(pending).toContain('data-testid="intro-accept"');
    expect(pending).toContain('data-testid="intro-decline"');
    expect(pending.match(/we-btn-ghost/g)).toHaveLength(2);
    expect(renderToStaticMarkup(<IntroRequest {...base} status="pending" initialForm />)).toContain('data-testid="intro-confirm"');
    expect(renderToStaticMarkup(<IntroRequest {...base} status="accepted" slot={{ time: "Thu 26 Nov, 13:00", place: "Table 11" }} />)).toContain("Table 11");
    for (const s of ["declined", "expired", "waiting"] as const) expect(renderToStaticMarkup(<IntroRequest {...base} status={s} />)).toContain(`data-status="${s}"`);
  });
  it("gives approve and remove identical weight and offers no approve-all", () => {
    const text = { approve: "Approve", remove: "Remove", undo: "Undo", hint: "Decide this person on their own.", approved: "Approved", approvedNote: "Will be in today's list.", removed: "Removed" };
    const html = renderToStaticMarkup(<DecisionControls status="undecided" text={text} />);
    const approve = html.match(/<button[^>]*data-testid="pick-approve"/)?.[0] ?? "";
    const remove = html.match(/<button[^>]*data-testid="pick-remove"/)?.[0] ?? "";
    expect(approve.match(/class="([^"]*)"/)?.[1]).toBe(remove.match(/class="([^"]*)"/)?.[1]);
    expect(html).not.toMatch(/approve all|checkbox/i);
    expect(renderToStaticMarkup(<DecisionControls status="approved" text={text} />)).toContain("pick-undo");
    expect(renderToStaticMarkup(<DecisionControls status="removed" reason="Already in contact." text={text} />)).toContain("Already in contact.");
    expect(renderToStaticMarkup(<DecisionControls status="undecided" approveDisabled text={text} />)).toContain("disabled");
  });
  it("renders an organiser pick with no number next to the person", () => {
    const html = renderToStaticMarkup(
      <OrganiserPickCard pickId="p1" handle="Harbour-90" handleAria="Nickname Harbour-90" summary="Keeps scanners running and trains new staff." whyToday="Why today: not suggested to anyone for three days" syntheticLabel="Synthetic person" status="undecided" reasons={<ReasonList variant="organiser"><ReasonLine variant="organiser" cardText="Fixing scanners" cardKind="rendering" postingSentence="Troubleshoot scanners." text={reasonText} /></ReasonList>} notMentioned={nm} controls={<span>controls</span>} />,
    );
    const visible = stripTags(html).replace("Harbour-90", "");
    expect(visible).not.toMatch(/\d|%|★|☆/);
    expect(html).toContain('data-pick-id="p1"');
  });
  it("renders the company pick for open, requested and revealed states without digits on the card", () => {
    const text = { ask: "Ask to meet", askNote: "Their name stays hidden unless they accept.", confirmTitle: "t", confirmBody: "b", send: "Send", cancel: "Cancel", withdraw: "Withdraw", accept: "Accept", decline: "Decline", declined: "The person chose not to meet this time.", both: "You both agreed to meet." };
    const base = { pickId: "p1", handle: "Birch-27", handleAria: "Nickname Birch-27", syntheticLabel: "Synthetic person", summary: "Practical nurse who trains new staff.", aiLabel: "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact.", aiTag: "AI", reasons: <ReasonList variant="company"><ReasonLine variant="company" cardText="Trains new staff" cardKind="rendering" postingSentence="You will onboard new colleagues." text={reasonText} /></ReasonList>, text };
    const open = renderToStaticMarkup(<CompanyPickCard {...base} intro={{ status: "none" }} />);
    expect(open).toContain('data-testid="ask-to-meet"');
    expect(stripTags(open).replace("Birch-27", "")).not.toMatch(/\d|%|★/);
    expect(renderToStaticMarkup(<CompanyPickCard {...base} intro={{ status: "requested", waiting: "Request sent." }} />)).toContain('data-status="requested"');
    const revealed = renderToStaticMarkup(<CompanyPickCard {...base} intro={{ status: "revealed", name: "Aino Virtanen", contact: "aino@example.org", slot: { time: "Thu 26 Nov, 13:00", place: "Table 03" } }} />);
    expect(revealed).toContain('data-testid="revealed-name"');
    expect(open).not.toContain("Aino Virtanen");
  });
  it("renders publish box blocked and ready, naming who is undecided and without a progress bar", () => {
    const text = { status: "3 of 4 left to decide", ready: "Every suggestion has a decision", published: "Published", publish: "Publish to Demo company 03", helpLead: "Decide", names: "Harbour-90, Lantern-63 and Quartz-14", helpTail: "first.", sent: "Sent to the company's private link." };
    const blocked = renderToStaticMarkup(<PublishBox total={4} undecided={["Harbour-90", "Lantern-63", "Quartz-14"]} text={text} />);
    expect(blocked).toContain("Harbour-90, Lantern-63 and Quartz-14");
    expect(blocked).toContain("disabled");
    expect(blocked).not.toMatch(/progress|<meter/i);
    const ready = renderToStaticMarkup(<PublishBox total={4} undecided={[]} text={text} />);
    expect(ready).not.toContain("disabled");
    expect(renderToStaticMarkup(<PublishBox total={4} undecided={[]} published link="https://x.test/c/abc" text={text} />)).toContain('data-testid="digest-link"');
    expect(renderToStaticMarkup(<KeysBar hints={[{ key: "J K", label: "move" }]} rule="One person at a time. No approve-all." inline />)).toContain("No approve-all.");
  });
  it("renders requirements and questions", () => {
    const text = { must: "Must-have", nice: "Nice-to-have", fromPosting: "From your posting", addedByYou: "Added by you", showSentence: "Show", hideSentence: "Hide", edit: "Edit", save: "Save", cancel: "Cancel", statutory: "Set by law.", kindGroup: "Kind" };
    const reqs = [{ id: "r1", text: "Fluent working Finnish", kind: "must" as const, category: "Language", postingSentence: "You work in Finnish.", statutory: false }];
    expect(renderToStaticMarkup(<RequirementList mode="compact" requirements={reqs} text={text} />)).toContain("Must-have");
    const full = renderToStaticMarkup(<RequirementList mode="full" editable requirements={reqs} text={text} />);
    expect(full).toContain('data-testid="requirement-category"');
    const q = renderToStaticMarkup(<RequirementQuestion requirement="Fluent working Finnish" question={{ text: "Is Finnish needed from day one?", why: "Some people did not mention it." }} evidence={<PoolEvidenceLine kind="normal" speakTo={12} relevant={30} exclude={18} templates={{ normal: "**{speakTo} of {relevant}** speak to this. A hard filter would set aside **{exclude}**.", languageExtra: "({selfDeclaredOnly})", statutory: "s", wholePool: "w" }} asOf="As of 09:14" />} text={{ label: "A question about {requirement}", keep: "Keep as must-have", makeNice: "Make it nice-to-have", reword: "Change the wording", remove: "Remove it", rewordLabel: "New wording", save: "Save" }} />);
    expect(q.match(/we-btn-ghost/g)).toHaveLength(4);
    expect(q).toContain("<b>12 of 30</b>");
  });
  it("renders the masked banner and the remaining banners", () => {
    expect(renderToStaticMarkup(<MaskedDemoBanner lead="Demo company 03." text="The people below are synthetic." />)).toContain('data-testid="masked-banner"');
  });
  it("renders the handle without initials or avatars", () => {
    const html = renderToStaticMarkup(<PersonHandle handle="Birch-27" ariaLabel="Nickname Birch-27" />);
    expect(html).toContain('aria-label="Nickname Birch-27"');
    expect(html).not.toMatch(/<img|avatar/i);
  });
});
