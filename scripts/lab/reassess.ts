/**
 * Lab only: `npx tsx --env-file=.env.local scripts/lab/reassess.ts [--all | <applicationId>...]`
 * Rates stored applications of simulated people again with the prompt and checks as they are
 * now, keeping their interviews. For use after the assessment prompt or its checks changed.
 * Never touches an application of a person who is not simulated.
 */
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "../../src/db/client";
import { application, talent } from "../../src/db/schema";
import { assessApplication } from "../../src/features/application";

async function main() {
  const db = getDb();
  const args = process.argv.slice(2);
  const rows = await db
    .select({ id: application.id })
    .from(application)
    .innerJoin(talent, eq(talent.id, application.talentId))
    .where(and(eq(talent.synthetic, true), eq(application.status, "assessed"), args.includes("--all") ? undefined : inArray(application.id, [...args, ""])));
  let done = 0;
  for (const { id } of rows) {
    const [before] = await db.select().from(application).where(eq(application.id, id));
    await db.update(application).set({ status: "submitted", assessment: null, assessedAt: null }).where(eq(application.id, id));
    try {
      const assessment = await assessApplication(db, id);
      if (!assessment) throw new Error("no assessment came back");
      done++;
      console.log(`${id}: levels ${assessment.ratings.map((r) => r.level).join(" ")}, worded by ${assessment.ratings.map((r) => r.wording[0]).join("")}`);
    } catch (error) {
      // Put the earlier rating back: a failed re-rating must not leave the application unrated.
      await db.update(application).set({ status: "assessed", assessment: before.assessment, assessedAt: before.assessedAt }).where(eq(application.id, id));
      console.log(`${id}: kept the earlier rating (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  console.log(`Rated again: ${done} of ${rows.length}`);
  await closeDb();
}
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
