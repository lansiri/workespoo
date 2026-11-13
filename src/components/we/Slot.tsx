import { cx } from "./cx";
import { Icon } from "./icons";

/** A meeting time and place, for example "Thu 26 Nov, 13:00 · Table 03". Text arrives formatted. */
export function Slot({ time, place, className }: { time: string; place: string; className?: string }) {
  return (
    <span className={cx("we-slot", className)} data-testid="slot">
      <Icon name="calendar" />
      <span>
        {time} · {place}
      </span>
    </span>
  );
}
