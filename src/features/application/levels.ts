import type { LocalText, UiLang } from "@/contracts";

/**
 * The four levels as people read them: a short name, the anchor (what the level means), and
 * the sentence code uses as the reason when the model's own reason could not be used. One
 * place for the person's, the organiser's and the company's screens, and for the assessment's
 * checks. The English anchors are `RATING_LEVELS` in the contract, word for word.
 */
export const LEVEL_NAMES: Record<UiLang, readonly [string, string, string, string]> = {
  en: ["No evidence", "Stated", "Example", "Example close to this job"],
  fi: ["Ei näyttöä", "Mainittu", "Esimerkki", "Esimerkki tätä työtä vastaavasta"],
  sv: ["Inget underlag", "Nämnt", "Exempel", "Exempel nära det här jobbet"],
};

export const LEVEL_ANCHORS: Record<UiLang, readonly [string, string, string, string]> = {
  en: [
    "Nothing in the answers speaks to this requirement.",
    "The person says they have this, without an example from their own work.",
    "A concrete example from the person's own work that involves this.",
    "A concrete example from their own work, with what they did and what came of it, in a setting like the one the ad describes.",
  ],
  fi: [
    "Vastauksissa ei puhuttu tästä vaatimuksesta.",
    "Henkilö kertoo osaavansa tämän, mutta ilman esimerkkiä omasta työstään.",
    "Konkreettinen esimerkki henkilön omasta työstä, johon tämä liittyy.",
    "Konkreettinen esimerkki omasta työstä: mitä hän teki ja mitä siitä seurasi, ilmoitusta vastaavassa ympäristössä.",
  ],
  sv: [
    "Inget i svaren handlar om det här kravet.",
    "Personen säger sig kunna detta, men utan ett exempel från sitt eget arbete.",
    "Ett konkret exempel från personens eget arbete där detta ingår.",
    "Ett konkret exempel från eget arbete: vad personen gjorde och vad det ledde till, i en miljö som liknar annonsens.",
  ],
};

/** The same anchors as the person reads them on their own result: said to them, not about them. */
export const LEVEL_ANCHORS_OWN: Record<UiLang, readonly [string, string, string, string]> = {
  en: [
    "Nothing in your answers speaks to this requirement.",
    "You say you have this, without an example from your own work.",
    "A concrete example from your own work that involves this.",
    "A concrete example from your own work, with what you did and what came of it, in a setting like the one the ad describes.",
  ],
  fi: [
    "Vastauksissasi ei puhuttu tästä vaatimuksesta.",
    "Kerrot osaavasi tämän, mutta ilman esimerkkiä omasta työstäsi.",
    "Konkreettinen esimerkki omasta työstäsi, johon tämä liittyy.",
    "Konkreettinen esimerkki omasta työstäsi: mitä teit ja mitä siitä seurasi, ilmoitusta vastaavassa ympäristössä.",
  ],
  sv: [
    "Inget i dina svar handlar om det här kravet.",
    "Du säger att du kan detta, men utan ett exempel från ditt eget arbete.",
    "Ett konkret exempel från ditt eget arbete där detta ingår.",
    "Ett konkret exempel från ditt eget arbete: vad du gjorde och vad det ledde till, i en miljö som liknar annonsens.",
  ],
};

/**
 * How many points apart two neighbours on a list can be and still be read as level. Two points
 * is one level on one must-have, which is what a second rating of the same answers was seen to
 * change now and then (the swap check, `evals/application-swap`: 4 of 108 levels moved when the
 * same words were rated again, 24 of 216 in another language). The lists say so next to such
 * neighbours, so that nobody reads a difference into the order that the ratings cannot carry.
 */
export const CLOSE_POINTS = 2;

/** The reason code writes for a level when the model's reason failed a check. */
export const CODE_REASONS: readonly [LocalText, LocalText, LocalText, LocalText] = [
  {
    en: "Nothing in the answers speaks to this requirement.",
    fi: "Vastauksissa ei puhuttu tästä vaatimuksesta.",
    sv: "Inget i svaren handlar om det här kravet.",
  },
  {
    en: "The answers say this is familiar, without an example from the person's own work.",
    fi: "Vastauksissa kerrotaan, että tämä on tuttua, mutta ilman esimerkkiä omasta työstä.",
    sv: "Svaren säger att detta är bekant, men utan ett exempel från eget arbete.",
  },
  {
    en: "The answers give a concrete example from the person's own work.",
    fi: "Vastauksissa on konkreettinen esimerkki omasta työstä.",
    sv: "Svaren ger ett konkret exempel från eget arbete.",
  },
  {
    en: "The answers give a concrete example with what was done and what came of it, in a setting like the ad's.",
    fi: "Vastauksissa on konkreettinen esimerkki siitä, mitä tehtiin ja mitä siitä seurasi, ilmoitusta vastaavassa ympäristössä.",
    sv: "Svaren ger ett konkret exempel på vad som gjordes och vad det ledde till, i en miljö som liknar annonsens.",
  },
];

/** The reason for a requirement the person skipped or did not answer. */
export const NOT_ANSWERED_REASON: LocalText = {
  en: "The question was not answered.",
  fi: "Kysymykseen ei vastattu.",
  sv: "Frågan besvarades inte.",
};

/** The summary code writes when the model's summary could not be used. `{n}` of `{m}` requirements had a concrete example. */
export const CODE_SUMMARY: LocalText = {
  en: "The answers gave concrete examples for {n} of {m} requirements.",
  fi: "Vastauksissa oli konkreettinen esimerkki {n} vaatimuksesta ({m} kysyttiin).",
  sv: "Svaren gav konkreta exempel för {n} av {m} krav.",
};
