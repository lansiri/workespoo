"use client";

/**
 * The assembled Signal Card page, built only from kit components: intro row with the view switch, the card,
 * and the sticky side column with approve, pool consent and data controls. Try Remove, Undo, Edit, the view
 * switch and Approve. Pool consent stays empty and locked until the card is approved.
 */
import { useState } from "react";
import {
  ApproveBar, ApproveBox, CompanyPreviewBanner, CompanyViewSwitch, DataControls, PageShell, PoolConsent, SignalCard, Tag, type SignalCardGroup,
} from "@/components/we";
import { rowText, signals } from "./samples";

const GROUPS: { key: string; title: string; groups: string[] }[] = [
  { key: "skill", title: "What I do", groups: ["skill"] },
  { key: "tool", title: "Tools", groups: ["tool"] },
  { key: "knowledge", title: "Know-how", groups: ["knowledge"] },
  { key: "domain", title: "Fields", groups: ["domain"] },
];

const shell = {
  logoLabel: "WorkEspoo", wordmark: "WorkEspoo", navLabel: "Main", languageLabel: "Language", menuLabel: "Menu",
  languages: [
    { code: "en" as const, label: "English", href: "#", current: true },
    { code: "fi" as const, label: "Suomi", href: "#", current: false },
    { code: "sv" as const, label: "Svenska", href: "#", current: false },
  ],
  nav: [
    { key: "interview", label: "Interview", href: "#" },
    { key: "card", label: "My card", href: "#" },
    { key: "matches", label: "My matches", href: "#" },
    { key: "how", label: "How this works", href: "#" },
  ],
};

export function CardDemo({ initialView = "person", initialApproved = false }: { initialView?: "person" | "company"; initialApproved?: boolean }) {
  const [view, setView] = useState<"person" | "company">(initialView);
  const [approved, setApproved] = useState(initialApproved);
  const [pool, setPool] = useState<boolean | null>(null);
  const [removed, setRemoved] = useState<string[]>(["s5"]);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
  const [phrases, setPhrases] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState(false);
  const rows = signals.map((s) => ({ ...s, phrase: phrases[s.id] ?? s.phrase, removed: removed.includes(s.id) }));
  const groups: SignalCardGroup[] = GROUPS.map((g) => ({ key: g.key, title: g.title, rows: rows.filter((r) => g.groups.includes(r.group)) })).filter((g) => g.rows.length > 0);
  const kept = rows.filter((r) => !r.removed).length;
  const tally = `${kept} notes kept · ${removed.length} removed`;
  const text = {
    sticker: "Yours to approve", title: "Approve your card", help: "Your card is a draft. Nobody sees it until you approve it, and you can change it at any time.",
    approve: "Approve my card", preparing: "Preparing company view…", empty: "Keep at least one note to approve your card.", approved: "Approved. You can change your card at any time.", goToMatches: "See jobs that fit your card →",
  };
  const state = approved ? "approved" : kept === 0 ? "empty" : "ready";
  return (
    <div className="we-frame">
      <PageShell audience="talent" current="card" {...shell}>
        <div className="we-cd-wrap">
          <div className="we-cd-intro">
            <div>
              <h1>Your Signal Card</h1>
              <p>This is what the AI noted from your conversation. Everything on it is yours to change. Nothing here is a score.</p>
            </div>
            <CompanyViewSwitch value={view} onChange={setView} groupLabel="Preview" personLabel="My view" companyLabel="What companies see" />
          </div>
          <div data-testid={view === "company" ? "company-preview" : undefined}>
            {view === "company" ? (
              <CompanyPreviewBanner className="we-cp-banner">
                This is exactly what a company sees. Your own words, your language and whether you spoke or typed stay with you until you both say yes.
              </CompanyPreviewBanner>
            ) : null}
            <SignalCard
              view={view}
              approved={approved}
              handle="Birch-27"
              handleAria="Nickname Birch-27"
              header={{
                kicker: "Signal Card",
                aiTag: "AI",
                aiLabel: view === "company" ? "Summary written by AI from this person's own words" : "Summary written by AI from your own words",
                headline: "Keeps the warehouse moving, and the scanners running",
                summary: "Six years of receiving, checking and booking goods in Espoo and Vantaa. The person you call when a handheld scanner freezes, and who shows new colleagues how the floor works.",
                readSummary: "Read the summary",
                hideSummary: "Hide the summary",
              }}
              orderNote={view === "company" ? "Written by AI from this person's own words and approved by them. Not a quote, not a verified fact." : "Notes are in the order you talked about them. Nothing here is scored."}
              groups={groups}
              editing={editing ? { ...editing, onDraftChange: (v) => setEditing({ id: editing.id, draft: v }), onSave: () => { setPhrases((p) => ({ ...p, [editing.id]: editing.draft.trim() })); setEditing(null); }, onCancel: () => setEditing(null), sensitiveWarning: /health|age/i.test(editing.draft) ? "Companies will see this. You don't need to share it." : undefined } : undefined}
              rowText={rowText}
              addOwn={{ label: "Add your own", onAdd: () => setRemoved([]) }}
              lookingFor={
                <>
                  <h3 className="we-looking-title">What you&apos;re looking for</h3>
                  <p className="we-hint-line">All optional. Companies can see this.</p>
                  <dl>
                    <div>
                      <dt>Roles</dt>
                      <dd><Tag>Warehouse</Tag><Tag>Logistics coordination</Tag></dd>
                    </div>
                    <div>
                      <dt>How I would work</dt>
                      <dd><Tag>On site</Tag><Tag>Day shifts</Tag></dd>
                    </div>
                  </dl>
                </>
              }
              footer={["Synthetic demo profile", approved ? "Approved by you" : "Draft · nobody sees this until you approve it", "Skill labels: ESCO, European Commission"]}
              stampLabel="Approved by you"
              waitingText="Preparing your notes…"
              waitingBadge="Writing notes…"
              emptyText="No notes yet. Add your own to get started."
              errorText="We couldn't prepare all your notes. You can add your own and approve when ready."
              onEditSignal={(id) => setEditing({ id, draft: rows.find((r) => r.id === id)?.phrase ?? "" })}
              onRemoveSignal={(id) => setRemoved((r) => [...r, id])}
              onUndo={(id) => setRemoved((r) => r.filter((x) => x !== id))}
            />
          </div>
          <aside className="we-cd-side">
            {view === "company" ? (
              <div className="we-box">
                <h3>Nothing here is a score</h3>
                <p>Companies see notes in the order you talked about them. No ranking, no percentages, no strength levels.</p>
              </div>
            ) : (
              <>
                <ApproveBox state={state} tally={tally} text={text} onApprove={() => setApproved(true)} />
                <PoolConsent
                  approved={approved}
                  inPool={pool}
                  onChange={setPool}
                  text={{ title: "Can Espoo suggest you to companies?", body: "If you say yes, an organiser may suggest your card to a company with a matching job. They only see what is on your card, and never your name.", yes: "Yes, suggest me", yesHelp: "A person at the City of Espoo checks every suggestion before it is sent.", no: "Not now", noHelp: "Your card stays with you. You can change this later.", locked: "Approve your card first. Nothing is chosen for you.", statusIn: "You are in the pool. You can leave at any time.", statusOut: "You are not in the pool.", leave: "Leave the pool", leaveTitle: "Leave the pool?", leaveBody: "Nobody will suggest your card to companies any more.", leaveConfirm: "Leave the pool", cancel: "Cancel" }}
                />
                <DataControls
                  deleted={deleted}
                  onDelete={() => setDeleted(true)}
                  purgeNotice="This is a live demo session. Everything is deleted automatically after 24 hours."
                  text={{ title: "Your data", body: "Download everything WorkEspoo has about you, or delete it.", export: "Download my data", delete: "Delete everything", confirmTitle: "Delete everything?", confirmBody: "Your card, your answers and your choices are deleted for good.", confirmYes: "Yes, delete everything", cancel: "Cancel", deleted: "Everything has been deleted." }}
                />
              </>
            )}
          </aside>
        </div>
      </PageShell>
      {view === "person" ? <ApproveBar state={state} tally={tally} text={text} onApprove={() => setApproved(true)} /> : null}
    </div>
  );
}
