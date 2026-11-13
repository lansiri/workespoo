import type { UiLang } from "@/contracts";
import { howItWorks, type HowItWorksSection } from "@/lib/i18n/content/how-it-works";

/**
 * Texts for the "How this works" page. Most paragraphs come from the shared content in
 * `src/lib/i18n/content/how-it-works.ts` (spec section 7). Two paragraphs are written here
 * because the shared text claims things the product does not do yet:
 *  - "Your data": the shared text says people can download or delete their data at any time.
 *    There is no such function in the code, so the sentence is left out.
 *  - "Your words are the evidence" and "You decide": the shared text promises correcting any
 *    sentence and adding your own note; the code supports neither.
 *  - "Limits we know about": the shared text says the team tests the same answers with different
 *    names and languages. Nothing in the code does that, so the clause is left out.
 */

export type VoiceProcessor = "elevenlabs" | "browser" | "none";

interface PageTexts {
  metaDescription: string;
  /** Voice sentences, one per processor. */
  voiceBrowser: string;
  voiceElevenlabs: string;
  voiceNone: string;
  /** Model line, placed after "Your text is processed by". */
  modelLine: string;
  dataBody: string;
  evidenceBody: string;
  decideBody: string;
  limitsBody: string;
  numbersHeading: string;
  numbersIntro: string;
  openPostings: string;
  modelCalls: string;
  firstWord: string;
  firstWordNone: string;
  picksApproved: string;
  picksRemoved: string;
  introsAgreed: string;
  noHuman: string;
  noHumanNote: string;
  unitSeconds: string;
}

const texts: Record<UiLang, PageTexts> = {
  en: {
    metaDescription: "How WorkEspoo's AI interviewer works, what it does not do, and what companies see.",
    voiceBrowser:
      "Your voice is turned into text by your browser's own speech service, which may keep it under its own terms; you can type instead.",
    voiceElevenlabs:
      "Your voice is turned into text by ElevenLabs, which may keep it under its own terms; you can type instead.",
    voiceNone: "Voice is switched off in this deployment, so you type your answers.",
    modelLine: "an open-weight AI model (Kimi K3.1) run by Verda on servers in Finland",
    dataBody:
      "We do not store audio. {voice} Your text is processed by {model}. Live demo sessions are deleted after 24 hours.",
    evidenceBody:
      "Each note on your Signal Card points to sentences you said. The computer shows your sentences exactly as they were transcribed; the AI cannot invent a quote. Speech recognition makes mistakes, especially with accents, so you can type instead of speaking.",
    decideBody:
      "You can reword any note or remove it, and approve the card only when you are happy with it. Nothing is used before you approve it.",
    limitsBody:
      "Speech recognition is less accurate for some accents. AI models can miss things or describe them differently for different people; that is why you review everything. Some skills have no match in the European ESCO skills list; they stay on your card anyway.",
    numbersHeading: "What this system has done so far",
    numbersIntro: "Totals only, read from the database. Nothing here is about one person.",
    openPostings: "Open job postings held",
    modelCalls: "AI model calls logged",
    firstWord: "Median time to the first word of the interviewer's replies, last 24 hours",
    firstWordNone: "no replies in the last 24 hours",
    picksApproved: "Suggestions an organiser approved",
    picksRemoved: "Suggestions an organiser removed",
    introsAgreed: "Introductions both sides agreed to",
    noHuman: "Decisions made about a person without a human",
    noHumanNote:
      "This is a rule of the system, not a measurement: nothing about a person is sent to a company until an organiser has approved it.",
    unitSeconds: "s",
  },
  fi: {
    metaDescription:
      "Miten WorkEspoon tekoälyhaastattelija toimii, mitä se ei tee ja mitä yritykset näkevät.",
    voiceBrowser:
      "Puheesi muuttaa tekstiksi selaimesi oma puhepalvelu, joka voi säilyttää sen omien ehtojensa mukaan. Voit myös kirjoittaa.",
    voiceElevenlabs:
      "Puheesi muuttaa tekstiksi ElevenLabs, joka voi säilyttää sen omien ehtojensa mukaan. Voit myös kirjoittaa.",
    voiceNone: "Puhe on tässä palvelussa pois käytöstä, joten kirjoitat vastauksesi.",
    modelLine: "avoimin painoin julkaistu tekoälymalli (Kimi K3.1), jota Verda ajaa palvelimilla Suomessa",
    dataBody:
      "Emme tallenna ääntä. {voice} Tekstiäsi käsittelee {model}. Livedemon istunnot poistetaan 24 tunnin kuluttua.",
    evidenceBody:
      "Jokainen Signal Card -korttisi muistiinpano viittaa lauseisiin, jotka sanoit. Lauseesi näytetään täsmälleen niin kuin ne litteroitiin, eikä tekoäly voi keksiä lainausta. Puheentunnistus tekee virheitä, varsinkin aksenttien kanssa, joten voit kirjoittaa puhumisen sijaan.",
    decideBody:
      "Voit muotoilla minkä tahansa muistiinpanon uudelleen tai poistaa sen. Hyväksyt kortin vasta, kun olet siihen tyytyväinen. Mitään ei käytetä ennen kuin hyväksyt sen.",
    limitsBody:
      "Puheentunnistus toimii joillakin aksenteilla huonommin. Tekoälymallit voivat jättää asioita huomaamatta tai kuvata niitä eri ihmisille eri tavoin. Siksi tarkistat kaiken itse. Kaikille taidoille ei löydy vastinetta eurooppalaisesta ESCO-luokituksesta. Ne pysyvät silti kortillasi.",
    numbersHeading: "Mitä järjestelmä on tehnyt tähän mennessä",
    numbersIntro: "Vain kokonaismääriä, luettu tietokannasta. Mikään tässä ei koske yksittäistä ihmistä.",
    openPostings: "Avoimia työpaikkailmoituksia",
    modelCalls: "Kirjattuja tekoälymallin kutsuja",
    firstWord: "Haastattelijan vastausten ensimmäisen sanan mediaaniaika, viimeiset 24 tuntia",
    firstWordNone: "ei vastauksia viimeisen 24 tunnin aikana",
    picksApproved: "Ehdotuksia, jotka järjestäjä hyväksyi",
    picksRemoved: "Ehdotuksia, jotka järjestäjä poisti",
    introsAgreed: "Esittelyjä, joihin molemmat osapuolet suostuivat",
    noHuman: "Ihmistä koskevia päätöksiä ilman ihmistä",
    noHumanNote:
      "Tämä on järjestelmän sääntö, ei mittaus: mitään ihmisestä ei lähetetä yritykselle ennen kuin järjestäjä on hyväksynyt sen.",
    unitSeconds: "s",
  },
  sv: {
    metaDescription:
      "Så fungerar WorkEspoos AI-intervjuare, vad den inte gör och vad företagen ser.",
    voiceBrowser:
      "Ditt tal görs om till text av webbläsarens egen taltjänst, som kan spara det enligt sina egna villkor. Du kan också skriva.",
    voiceElevenlabs:
      "Ditt tal görs om till text av ElevenLabs, som kan spara det enligt sina egna villkor. Du kan också skriva.",
    voiceNone: "Tal är avstängt i den här tjänsten, så du skriver dina svar.",
    modelLine: "en AI-modell med öppna vikter (Kimi K3.1) som Verda kör på servrar i Finland",
    dataBody:
      "Vi sparar inte ljud. {voice} Din text behandlas av {model}. Sessioner i livedemon raderas efter 24 timmar.",
    evidenceBody:
      "Varje anteckning på ditt Signal Card hänvisar till meningar som du sa. Dina meningar visas exakt som de skrevs ut, och AI:n kan inte hitta på ett citat. Taligenkänningen gör misstag, särskilt när man har brytning, så du kan skriva i stället för att tala.",
    decideBody:
      "Du kan formulera om vilken anteckning som helst eller ta bort den. Du godkänner kortet först när du är nöjd med det. Ingenting används innan du har godkänt det.",
    limitsBody:
      "Taligenkänningen fungerar sämre med vissa brytningar. AI-modeller kan missa saker eller beskriva dem olika för olika personer. Därför går du själv igenom allt. Vissa färdigheter saknar motsvarighet i den europeiska ESCO-klassificeringen. De står ändå kvar på ditt kort.",
    numbersHeading: "Vad systemet har gjort hittills",
    numbersIntro: "Bara totalsiffror, lästa från databasen. Ingenting här gäller en enskild person.",
    openPostings: "Öppna jobbannonser",
    modelCalls: "Loggade anrop till AI-modellen",
    firstWord: "Mediantid till första ordet i intervjuarens svar, senaste 24 timmarna",
    firstWordNone: "inga svar de senaste 24 timmarna",
    picksApproved: "Förslag som en arrangör godkände",
    picksRemoved: "Förslag som en arrangör tog bort",
    introsAgreed: "Kontakter som båda sidor gick med på",
    noHuman: "Beslut om en person utan en människa",
    noHumanNote:
      "Det här är en regel i systemet, inte en mätning: ingenting om en person skickas till ett företag innan en arrangör har godkänt det.",
    unitSeconds: "s",
  },
};

export const howTexts = texts;

/** Index of the shared sections that this page replaces. Checked by the test by heading. */
const DATA_INDEX = 6;
const LIMITS_INDEX = 7;
const EVIDENCE_INDEX = 2;
const DECIDE_INDEX = 3;

export function voiceSentence(lang: UiLang, voice: VoiceProcessor): string {
  const t = texts[lang];
  return voice === "elevenlabs" ? t.voiceElevenlabs : voice === "none" ? t.voiceNone : t.voiceBrowser;
}

/** The page text for one language, with the voice and model lines filled in. */
export function pageContent(lang: UiLang, voice: VoiceProcessor) {
  const base = howItWorks[lang];
  const t = texts[lang];
  const sections: HowItWorksSection[] = base.sections.map((s, i) => {
    if (i === DATA_INDEX) {
      return {
        heading: s.heading,
        body: t.dataBody.replace("{voice}", voiceSentence(lang, voice)).replace("{model}", t.modelLine),
      };
    }
    if (i === EVIDENCE_INDEX) return { heading: s.heading, body: t.evidenceBody };
    if (i === DECIDE_INDEX) return { heading: s.heading, body: t.decideBody };
    if (i === LIMITS_INDEX) return { heading: s.heading, body: t.limitsBody };
    return s;
  });
  return { title: base.title, intro: base.intro, credit: base.credit, sections };
}
