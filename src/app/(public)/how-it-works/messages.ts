import type { UiLang } from "@/contracts";
import { howItWorks, type HowItWorksSection } from "@/lib/i18n/content/how-it-works";

/**
 * Texts for the "How this works" page. The paragraphs come from the shared content in
 * `src/lib/i18n/content/how-it-works.ts` (every sentence true of the product as built); this
 * file fills the two placeholders, `{voice}` and `{model}`, and holds the numbers section.
 */

export type VoiceProcessor = "elevenlabs" | "browser" | "server" | "none";

interface PageTexts {
  metaDescription: string;
  /** Voice sentences, one per processor. */
  voiceBrowser: string;
  voiceElevenlabs: string;
  voiceNone: string;
  voiceServer: string;
  /** Model line, placed after "Your text is processed by". */
  modelLine: string;
  notOfficial: string;
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
      "Your voice is turned into text by your browser's own speech service, which may keep it under its own terms; you can type instead. Where this server has it, the interviewer's voice is made on our own server.",
    voiceElevenlabs:
      "Your voice is turned into text by ElevenLabs, which may keep it under its own terms; you can type instead.",
    voiceNone: "Voice is switched off in this deployment, so you type your answers.",
    voiceServer:
      "When you answer by voice, the audio goes to WorkEspoo's own server, where an open speech model turns it into text, and it is deleted as soon as that is done. No outside speech service hears it, and you can type instead. Where this server has it, the interviewer's voice is made on our own server.",
    modelLine: "an open-weight AI model (Kimi K3.1) run by Verda on servers in Finland",
    notOfficial: "Not an official City of Espoo service",
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
      "Puheesi muuttaa tekstiksi selaimesi oma puhepalvelu, joka voi säilyttää sen omien ehtojensa mukaan. Voit myös kirjoittaa. Siellä, missä palvelimella on se käytössä, haastattelijan äänen tuottaa oma palvelimemme.",
    voiceElevenlabs:
      "Puheesi muuttaa tekstiksi ElevenLabs, joka voi säilyttää sen omien ehtojensa mukaan. Voit myös kirjoittaa.",
    voiceNone: "Puhe on tässä palvelussa pois käytöstä, joten kirjoitat vastauksesi.",
    voiceServer:
      "Kun vastaat puhumalla, ääni lähetetään WorkEspoon omalle palvelimelle, jossa avoin puheentunnistusmalli muuttaa sen tekstiksi, ja ääni poistetaan heti sen jälkeen. Mikään ulkopuolinen puhepalvelu ei kuule sitä, ja voit myös kirjoittaa. Siellä, missä palvelimella on se käytössä, haastattelijan äänen tuottaa oma palvelimemme.",
    modelLine: "avoimin painoin julkaistu tekoälymalli (Kimi K3.1), jota Verda ajaa palvelimilla Suomessa",
    notOfficial: "Ei Espoon kaupungin virallinen palvelu",
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
      "Ditt tal görs om till text av webbläsarens egen taltjänst, som kan spara det enligt sina egna villkor. Du kan också skriva. Där servern har det görs intervjuarens röst på vår egen server.",
    voiceElevenlabs:
      "Ditt tal görs om till text av ElevenLabs, som kan spara det enligt sina egna villkor. Du kan också skriva.",
    voiceNone: "Tal är avstängt i den här tjänsten, så du skriver dina svar.",
    voiceServer:
      "När du svarar med rösten skickas ljudet till WorkEspoos egen server, där en öppen taligenkänningsmodell gör om det till text, och ljudet raderas så snart det är gjort. Ingen utomstående taltjänst hör det, och du kan också skriva. Där servern har det görs intervjuarens röst på vår egen server.",
    modelLine: "en AI-modell med öppna vikter (Kimi K3.1) som Verda kör på servrar i Finland",
    notOfficial: "Inte en officiell tjänst från Esbo stad",
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

export function voiceSentence(lang: UiLang, voice: VoiceProcessor): string {
  const t = texts[lang];
  switch (voice) {
    case "elevenlabs":
      return t.voiceElevenlabs;
    case "server":
      return t.voiceServer;
    case "none":
      return t.voiceNone;
    default:
      return t.voiceBrowser;
  }
}

/** The page text for one language, with the voice and model lines filled in. */
export function pageContent(lang: UiLang, voice: VoiceProcessor) {
  const base = howItWorks[lang];
  const t = texts[lang];
  const sections: HowItWorksSection[] = base.sections.map((s) => ({
    heading: s.heading,
    body: s.body.replace("{voice}", voiceSentence(lang, voice)).replace("{model}", t.modelLine),
  }));
  return { title: base.title, intro: base.intro, credit: base.credit, sections };
}
