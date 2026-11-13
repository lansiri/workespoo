const TZ = "Europe/Helsinki";

function parts(now: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
}

/** The Helsinki calendar date, `YYYY-MM-DD`. */
export function helsinkiDate(now: Date): string {
  const p = parts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The Helsinki wall-clock time, `HH:MM`. */
export function helsinkiTime(now: Date): string {
  const p = parts(now);
  return `${p.hour}:${p.minute}`;
}

/** Start of a `YYYY-MM-DD` day as a UTC instant. Close enough for day-sized windows. */
export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function daysBefore(date: string, days: number): Date {
  return new Date(dayStart(date).getTime() - days * 24 * 60 * 60 * 1000);
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
