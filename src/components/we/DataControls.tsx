"use client";

import { useState } from "react";
import { cx } from "./cx";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { PurgeNotice } from "./Banners";

export type DataControlsProps = {
  /** "Your data" etc. */
  text: {
    title: string;
    body: string;
    export: string;
    delete: string;
    confirmTitle: string;
    confirmBody: string;
    confirmYes: string;
    cancel: string;
    deleted: string;
  };
  /** Live demo sessions only: the sentence about purging after 24 hours, already formatted. */
  purgeNotice?: string;
  deleted?: boolean;
  onExport?: () => void;
  onDelete?: () => void;
  className?: string;
};

/** "Your data": download and delete everything, plus the live-demo purge notice. Delete is the only danger button. */
export function DataControls({ text, purgeNotice, deleted, onExport, onDelete, className }: DataControlsProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className={cx("we-box", className)} aria-labelledby="we-data-title">
      <h3 id="we-data-title">{text.title}</h3>
      <p>{text.body}</p>
      {deleted ? (
        <p className="we-approved-line" role="status">
          {text.deleted}
        </p>
      ) : (
        <div className="we-data-row">
          <Button variant="ghost" icon="arrow" onClick={onExport} data-testid="export-data">
            {text.export}
          </Button>
          <Button variant="danger" onClick={() => setConfirming(true)} data-testid="delete-data">
            {text.delete}
          </Button>
        </div>
      )}
      {purgeNotice ? <PurgeNotice>{purgeNotice}</PurgeNotice> : null}
      {confirming ? (
        <Dialog
          title={text.confirmTitle}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {text.cancel}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirming(false);
                  onDelete?.();
                }}
                data-testid="delete-data-confirm"
              >
                {text.confirmYes}
              </Button>
            </>
          }
        >
          <p>{text.confirmBody}</p>
        </Dialog>
      ) : null}
    </section>
  );
}
