/**
 * Prints a session cookie for local work on the pages, for example to take screenshots of
 * `/card` as one of the seeded synthetic people.
 *
 *   npx tsx scripts/dev-cookie.ts --talent <talentId>     # a person's session
 *   npx tsx scripts/dev-cookie.ts --organiser             # the organiser's session
 *   npx tsx scripts/dev-cookie.ts --talent <id> --organiser
 *
 * It signs with SESSION_SECRET from the environment, so it only works against a server that
 * runs with the same secret: your own local one. The output is `name=value` on one line.
 */
import { parseArgs } from "node:util";
import { SESSION_COOKIE, encodeSession } from "../src/lib/session";

const { values } = parseArgs({
  options: {
    talent: { type: "string" },
    organiser: { type: "boolean", default: false },
  },
});

if (!values.talent && !values.organiser) {
  console.error("usage: npx tsx scripts/dev-cookie.ts --talent <talentId> [--organiser]");
  process.exit(2);
}
if (process.env.NODE_ENV === "production") {
  console.error("dev-cookie is for local work only");
  process.exit(2);
}

console.log(`${SESSION_COOKIE}=${encodeSession({ talentId: values.talent, organiser: values.organiser || undefined })}`);
