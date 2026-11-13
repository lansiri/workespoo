import { cx } from "./cx";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export type KeyHint = { key: string; label: string };

/** Fixed strip at the bottom of the review queue. Every key acts on one person; there is no approve-all. */
export function KeysBar({ hints, rule, inline, className }: { hints: KeyHint[]; rule: string; inline?: boolean; className?: string }) {
  return (
    <div className={cx("we-keys", !inline && "we-fixed", className)} role="note">
      {hints.map((h) => (
        <span key={h.key}>
          <kbd className="we-kbd">{h.key}</kbd> {h.label}
        </span>
      ))}
      <span className="we-no-all">{rule}</span>
    </div>
  );
}

/** Modal with every key. Headed by the rule that no key acts on several people. */
export function KeysOverlay({ title, keys, closeLabel, onClose, inline }: { title: string; keys: KeyHint[]; closeLabel: string; onClose: () => void; inline?: boolean }) {
  return (
    <Dialog
      title={title}
      inline={inline}
      onClose={onClose}
      actions={
        <Button variant="primary" onClick={onClose}>
          {closeLabel}
        </Button>
      }
    >
      <dl className="we-keys-list">
        {keys.map((k) => (
          <div key={k.key} className="we-keys-row">
            <dt>
              <kbd className="we-kbd">{k.key}</kbd>
            </dt>
            <dd>{k.label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
