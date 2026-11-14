/** Lab only: how long the first and the second run of the CV anonymiser take in a fresh process. */
import { anonymiseCv } from "../../src/features/interview/cv-anonymise";
const sample = "Curriculum Vitae\nAlex Demo\nalex.demo@example.test +358 40 000 0000\nBorn 12.3.1988, married\nWork experience\n2021-2025 ERP specialist, machine shop, Espoo\nWrote Python scripts.\nLanguages: English (fluent), Finnish (native)\nReferences: Matti Meikalainen";
for (const n of [1, 2, 3]) {
  const t = performance.now();
  anonymiseCv(sample);
  console.log(`node ${process.version} anonymiseCv run ${n}: ${(performance.now() - t).toFixed(0)} ms`);
}
