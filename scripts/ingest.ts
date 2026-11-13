/**
 * `npm run ingest -- <command>`
 *   esco                                  load the ESCO skills and occupations
 *   tmt [--municipality 049]... [--region 01] [--max-pages N]
 *   occupations [--limit N]               occupation-to-skill links from the ESCO API
 *   all                                   esco, then Espoo postings, then occupations
 */
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../src/db/client";
import { crawlOccupationSkills } from "../src/features/jobs/esco-occupations";
import { importEsco } from "../src/features/jobs/esco-import";
import { ingestTmt } from "../src/features/jobs/tmt";

const log = (message: string) => console.error(`  ${message}`);

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      municipality: { type: "string", multiple: true },
      region: { type: "string", multiple: true },
      "max-pages": { type: "string" },
      limit: { type: "string" },
    },
  });
  const command = positionals[0];
  const num = (v: string | undefined) => (v === undefined ? undefined : Number.parseInt(v, 10));
  const db = getDb();

  const runEsco = async () => {
    const t = Date.now();
    const r = await importEsco(db);
    console.log(
      `esco: ${r.skills.rows} skills (${r.skills.retired} retired), ${r.occupations.rows} occupations ` +
        `(${r.occupations.nationalOccupations} national, ${r.occupations.iscoGroupsSkipped} ISCO groups skipped) ` +
        `in ${((Date.now() - t) / 1000).toFixed(1)} s`,
    );
  };
  const runTmt = async (municipalities: string[], regions: string[]) => {
    const t = Date.now();
    const r = await ingestTmt(db, {
      municipalities,
      regions,
      maxPages: num(values["max-pages"]),
      onProgress: log,
    });
    console.log(
      `tmt: seen ${r.seen}, inserted ${r.inserted}, updated ${r.updated}, unchanged ${r.unchanged}, ` +
        `deactivated ${r.deactivated}, failed ${r.failed}, ${r.pages} pages${r.complete ? "" : " (incomplete)"} ` +
        `in ${((Date.now() - t) / 1000).toFixed(1)} s`,
    );
  };
  const runOccupations = async () => {
    const t = Date.now();
    const r = await crawlOccupationSkills(db, { limit: num(values.limit), onProgress: log });
    console.log(
      `occupations: ${r.pending} pending, fetched ${r.fetched}, ${r.links} links, ${r.missing} missing, ` +
        `${r.failed} failed in ${((Date.now() - t) / 1000).toFixed(1)} s`,
    );
  };

  switch (command) {
    case "esco":
      await runEsco();
      break;
    case "tmt": {
      const municipalities = values.municipality ?? [];
      const regions = values.region ?? [];
      await runTmt(municipalities.length === 0 && regions.length === 0 ? ["049"] : municipalities, regions);
      break;
    }
    case "occupations":
      await runOccupations();
      break;
    case "all":
      await runEsco();
      await runTmt(["049"], []);
      await runOccupations();
      break;
    default:
      console.error("usage: npm run ingest -- <esco | tmt [--municipality 049] [--region 01] [--max-pages N] | occupations [--limit N] | all>");
      process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("ingest failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
