import { cx } from "./cx";
import { Button } from "./Button";

export type PublishBoxProps = {
  total: number;
  /** Handles still undecided. */
  undecided: string[];
  published?: boolean;
  /** Private link after publishing. */
  link?: string;
  onPublish?: () => void;
  text: {
    /** "3 of 4 left to decide" (formatted by the page) */
    status: string;
    /** "Every suggestion has a decision" */
    ready: string;
    /** "Published" */
    published: string;
    /** "Publish to Demo company 03" */
    publish: string;
    /** Help before the names: "Publish turns on when every suggestion has a decision. Decide" */
    helpLead: string;
    /** Joined names, "Harbour-90, Lantern-63 and Quartz-14" (formatted by the page) */
    names: string;
    /** After the names: "first." */
    helpTail: string;
    /** "Sent to the company's private link." */
    sent: string;
  };
  className?: string;
};

/**
 * Publish one company's digest once every pick has a decision. Names who is still undecided. No progress bar
 * and no segment ticks: it is text only.
 */
export function PublishBox({ undecided, published, link, onPublish, text, className }: PublishBoxProps) {
  const blocked = undecided.length > 0;
  return (
    <section className={cx("we-pub-box", className)} aria-label={text.publish}>
      <p className="we-left">{published ? text.published : blocked ? text.status : text.ready}</p>
      <Button variant="primary" kbd="P" disabled={blocked || published} onClick={onPublish} data-testid="publish-digest">
        {text.publish}
      </Button>
      {published ? (
        <p className="we-pub-help">
          {text.sent}{" "}
          {link ? (
            <a className="we-a" href={link} data-testid="digest-link">
              {link}
            </a>
          ) : null}
        </p>
      ) : blocked ? (
        <p className="we-pub-help">
          {text.helpLead} <b>{text.names}</b> {text.helpTail}
        </p>
      ) : null}
    </section>
  );
}
