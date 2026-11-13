/**
 * Everything the interviewer says from a script, in English, Finnish and Swedish.
 * Source: docs/specs/interview.md sections 5, 6.2, 6.6 and 8. Every line and question here
 * passes `findBannedEvaluative` and `findProtectedQuestion` (see content.test.ts).
 *
 * Questions are written to be spoken by a text-to-speech voice: at most two short sentences,
 * exactly one question mark, no parentheses, slashes, abbreviations or symbols.
 */
import type { CoverageArea, UiLang } from "@/contracts";

export interface InterviewLines {
  /** Express mode opening. Says it is an AI, that the person approves the notes, and asks Q1. */
  openingExpress: string;
  /** Full mode opening. Same promises as express, plus the length. */
  openingFull: string;
  /** Normal end after the last planned question. */
  closing: string;
  /** End after the person asked to stop (pre-check, Stop button, or `[[STOP]]`). */
  closingStopped: string;
  /** End because the full-mode time cap (420 s) was reached. */
  closingTimeCap: string;
  /** Empty or garbled answer. Never blames the person or their speech. */
  repair: string;
  /** After two repairs in a row; followed by the fallback question for the next target. */
  repairFinal: string;
  /** After the person removed their last answer; followed by the same target's fallback question. */
  deleted: string;
  /** Short neutral lead-in after a skip, before the next question. */
  skipped: string;
  /** The person asked something the FACTS do not answer. */
  askOrganisers: string;
  /** The person asked the AI to judge an answer. */
  noRating: string;
  /** The person asked to delete everything. */
  deleteEverything: string;
  /** The person said something is hard or upsetting. No comment on feelings; offers skip or stop. */
  distressOffer: string;
  /** Said once after two off-topic answers in a row, before the target question. */
  offTopicReminder: string;
}

export const INTERVIEW_LINES: Record<UiLang, InterviewLines> = {
  en: {
    openingExpress:
      "Hi, I'm an AI interviewer for WorkEspoo. I'll ask three short questions and take notes, and at the end you'll check the notes, change anything and approve them yourself. To start: what kind of work have you been doing recently?",
    openingFull:
      "Hi, I'm an AI interviewer for WorkEspoo. I'll ask a few short questions, about four minutes, and take notes. At the end you'll check the notes, change anything and approve them yourself. To start: what kind of work have you been doing recently?",
    closing:
      "Thank you, that's all my questions. Your notes are ready: check them, change or remove anything, and approve only what you're happy with.",
    closingStopped: "Okay, we'll stop here. You can review the notes so far, or delete everything.",
    closingTimeCap:
      "Thank you, we're out of time, so that's all my questions. Your notes are ready: check them, change or remove anything, and approve only what you're happy with.",
    repair: "Sorry, I didn't catch that. Could you say it again, or type it if that's easier?",
    repairFinal: "Let's move on, and you can add anything I missed when you review your notes.",
    deleted: "Done, I've removed that answer.",
    skipped: "Okay, let's move on.",
    askOrganisers: "The organisers can help with that.",
    noRating: "I don't rate answers. I only take notes that you'll review.",
    deleteEverything: "You can delete everything with the Delete button, now or later.",
    distressOffer: "We can skip this topic, stop here, or carry on. What would you like to do?",
    offTopicReminder: "This conversation is for noting your work.",
  },
  fi: {
    openingExpress:
      "Hei, olen WorkEspoon tekoälyhaastattelija. Kysyn kolme lyhyttä kysymystä ja kirjaan vastauksistasi muistiinpanoja. Lopuksi tarkistat ne, muutat mitä haluat ja hyväksyt ne itse. Aloitetaan: millaista työtä olet tehnyt viime aikoina?",
    openingFull:
      "Hei, olen WorkEspoon tekoälyhaastattelija. Kysyn muutaman lyhyen kysymyksen, siihen menee noin neljä minuuttia, ja kirjaan vastauksistasi muistiinpanoja. Lopuksi tarkistat ne, muutat mitä haluat ja hyväksyt ne itse. Aloitetaan: millaista työtä olet tehnyt viime aikoina?",
    closing:
      "Kiitos, siinä olivat kaikki kysymykseni. Muistiinpanosi ovat nyt valmiit: tarkista ne, muuta tai poista mitä haluat ja hyväksy vain se, mihin olet tyytyväinen.",
    closingStopped: "Selvä, lopetetaan tähän. Voit tarkistaa tähänastiset muistiinpanot tai poistaa kaiken.",
    closingTimeCap:
      "Kiitos, aika tuli täyteen, joten siinä olivat kysymykseni. Muistiinpanosi ovat nyt valmiit: tarkista ne, muuta tai poista mitä haluat ja hyväksy vain se, mihin olet tyytyväinen.",
    repair: "Anteeksi, en saanut selvää. Voisitko sanoa sen uudelleen tai kirjoittaa sen, jos se on helpompaa?",
    repairFinal: "Mennään eteenpäin. Voit lisätä puuttuvat asiat, kun tarkistat muistiinpanosi.",
    deleted: "Selvä, poistin sen vastauksen.",
    skipped: "Selvä, mennään eteenpäin.",
    askOrganisers: "Järjestäjät osaavat auttaa siinä.",
    noRating: "En arvioi vastauksia. Teen vain muistiinpanoja, jotka tarkistat itse.",
    deleteEverything: "Voit poistaa kaiken Poista kaikki -painikkeella, nyt tai myöhemmin.",
    distressOffer: "Voimme ohittaa tämän aiheen, lopettaa tähän tai jatkaa. Mitä haluaisit tehdä?",
    offTopicReminder: "Tässä keskustelussa kirjataan ylös työtäsi ja sitä, mitä osaat.",
  },
  sv: {
    openingExpress:
      "Hej, jag är en AI-intervjuare för WorkEspoo. Jag ställer tre korta frågor och antecknar, och i slutet går du igenom anteckningarna, ändrar det du vill och godkänner dem själv. Vi börjar så här: vad har du arbetat med den senaste tiden?",
    openingFull:
      "Hej, jag är en AI-intervjuare för WorkEspoo. Jag ställer några korta frågor, det tar ungefär fyra minuter, och jag antecknar under tiden. I slutet går du igenom anteckningarna, ändrar det du vill och godkänner dem själv. Vi börjar så här: vad har du arbetat med den senaste tiden?",
    closing:
      "Tack, det var alla mina frågor. Dina anteckningar är klara: gå igenom dem, ändra eller ta bort det du vill och godkänn bara det du är nöjd med.",
    closingStopped: "Okej, då stannar vi här. Du kan gå igenom anteckningarna hittills eller radera allt.",
    closingTimeCap:
      "Tack, nu är tiden slut, så det var alla mina frågor. Dina anteckningar är klara: gå igenom dem, ändra eller ta bort det du vill och godkänn bara det du är nöjd med.",
    repair: "Förlåt, jag uppfattade inte det. Kan du säga det igen, eller skriva det om det är enklare?",
    repairFinal: "Vi går vidare. Du kan lägga till det jag missade när du går igenom anteckningarna.",
    deleted: "Klart, jag har tagit bort det svaret.",
    skipped: "Okej, vi går vidare.",
    askOrganisers: "Arrangörerna kan hjälpa dig med det.",
    noRating: "Jag bedömer inte svar. Jag gör bara anteckningar som du själv går igenom.",
    deleteEverything: "Du kan radera allt med knappen Radera allt, nu eller senare.",
    distressOffer: "Vi kan hoppa över det här ämnet, sluta här eller fortsätta. Vad vill du göra?",
    offTopicReminder: "Det här samtalet handlar om att anteckna ditt arbete.",
  },
};

/** Neutral acknowledgements of at most a few words. Never praise. */
export const NEUTRAL_ACKNOWLEDGEMENTS: Record<UiLang, string[]> = {
  en: ["Thanks.", "Okay.", "Thanks, that's clear.", "Got it."],
  fi: ["Kiitos.", "Selvä.", "Kiitos, selvä.", "Okei."],
  sv: ["Tack.", "Okej.", "Tack, då vet jag.", "Uppfattat."],
};

/**
 * Fallback question bank, used when the live model fails or the guard rejects its output.
 * The first question per area is the spec's bank question (rewritten where the spec's wording
 * trips the lexicon); `reask` and CV seeds also use the first one.
 */
export const FALLBACK_QUESTIONS: Record<UiLang, Record<CoverageArea, string[]>> = {
  en: {
    recent_work: [
      "What kind of work have you been doing recently?",
      "What have you been working on lately, paid or unpaid?",
      "What tasks have taken up most of your time recently?",
      "What did a usual day in your recent work involve?",
    ],
    example: [
      "Could you tell me about one specific task you handled yourself?",
      "Think of one situation at work that you sorted out yourself. What happened, and what did you do?",
      "What is one piece of work you finished recently, and how did you go about it?",
    ],
    tools: [
      "What tools, software or methods do you use in that work?",
      "Which equipment or programs do you use most often?",
      "When you do that work, what do you use to get it done?",
    ],
    people: [
      "Who did you work with or for, and what was your part?",
      "Who do you usually work with, and what is your part in the team?",
      "Who do you do the work for, and how do you help them?",
    ],
    beyond: [
      "Is there something you can do from studies, volunteering or an earlier job that you'd like noted?",
      "What have you learned outside your main job, for example in studies, volunteering or a project of your own?",
      "What do you still use from an earlier job that was different from your recent one?",
    ],
    open_floor: [
      "Is there anything else about your work you'd like in your notes?",
      "What else would you like your notes to say about your work?",
      "Is there something we haven't covered that you'd like noted?",
    ],
    looking_for: [
      "What kind of work would you like to do next?",
      "What kind of job or tasks are you hoping for next?",
      "What sort of work would you like to find?",
    ],
  },
  fi: {
    recent_work: [
      "Millaista työtä olet tehnyt viime aikoina?",
      "Mitä töitä olet tehnyt viime aikoina, palkallisia tai palkattomia?",
      "Mihin tehtäviin aikasi on viime aikoina enimmäkseen mennyt?",
      "Millainen oli tavallinen päivä viimeisimmässä työssäsi?",
    ],
    example: [
      "Voisitko kertoa yhdestä tehtävästä, jonka hoidit itse?",
      "Mieti yhtä tilannetta töissä, jonka selvitit itse. Mitä tapahtui ja mitä sinä teit?",
      "Mikä on yksi työ, jonka sait äskettäin valmiiksi, ja miten etenit siinä?",
    ],
    tools: [
      "Mitä työkaluja, ohjelmia tai menetelmiä käytät siinä työssä?",
      "Mitä laitteita tai ohjelmia käytät useimmiten?",
      "Mitä tarvitset avuksi, kun teet sitä työtä?",
    ],
    people: [
      "Kenen kanssa tai kenelle teit töitä, ja mikä oli oma osuutesi?",
      "Keiden kanssa yleensä työskentelet, ja mikä on sinun osuutesi porukassa?",
      "Kenelle teet työtä, ja miten autat heitä?",
    ],
    beyond: [
      "Onko opinnoista, vapaaehtoistyöstä tai aiemmasta työstä jäänyt jotain osaamista, jonka haluat kirjata?",
      "Mitä olet oppinut päätyösi ulkopuolella, esimerkiksi opinnoissa, vapaaehtoistyössä tai omissa projekteissa?",
      "Mitä käytät vielä nykyään jostain aiemmasta, erilaisesta työstä?",
    ],
    open_floor: [
      "Onko työstäsi vielä jotain, minkä haluat muistiinpanoihin?",
      "Mitä muuta haluaisit muistiinpanoihin työstäsi?",
      "Jäikö jotain puhumatta, minkä haluaisit vielä kirjata?",
    ],
    looking_for: [
      "Millaista työtä etsit seuraavaksi?",
      "Millaisia töitä tai tehtäviä toivoisit seuraavaksi?",
      "Millaista työtä haluaisit tehdä jatkossa?",
    ],
  },
  sv: {
    recent_work: [
      "Vad har du arbetat med den senaste tiden?",
      "Vilket slags arbete har du gjort på sistone, med eller utan lön?",
      "Vilka uppgifter har du lagt mest tid på den senaste tiden?",
      "Hur såg en vanlig dag ut i ditt senaste arbete?",
    ],
    example: [
      "Kan du berätta om en konkret uppgift som du skötte själv?",
      "Tänk på en situation på jobbet som du löste själv. Vad hände, och vad gjorde du?",
      "Vilket arbete har du gjort klart nyligen, och hur gick du till väga?",
    ],
    tools: [
      "Vilka verktyg, program eller arbetssätt använder du i det arbetet?",
      "Vilken utrustning eller vilka program använder du oftast?",
      "Vad behöver du för att få det arbetet gjort?",
    ],
    people: [
      "Vem arbetade du med eller för, och vad var din del?",
      "Vilka brukar du arbeta tillsammans med, och vad är din del i gruppen?",
      "Vem gör du arbetet för, och hur hjälper du dem?",
    ],
    beyond: [
      "Finns det något du kan från studier, volontärarbete eller ett tidigare jobb som du vill få antecknat?",
      "Vad har du lärt dig utanför ditt huvudsakliga arbete, till exempel i studier, ideellt arbete eller egna projekt?",
      "Vad använder du fortfarande från ett tidigare jobb som var annorlunda än ditt senaste?",
    ],
    open_floor: [
      "Finns det något mer om ditt arbete som du vill ha med i anteckningarna?",
      "Vad mer vill du att anteckningarna ska säga om ditt arbete?",
      "Är det något vi inte har pratat om som du vill få antecknat?",
    ],
    looking_for: [
      "Vilket slags arbete söker du härnäst?",
      "Vilka arbetsuppgifter skulle du vilja ha härnäst?",
      "Vilken sorts jobb skulle du vilja hitta?",
    ],
  },
};

/**
 * Example probes, asked at most once per signal. `{phrase}` is the signal phrase: English,
 * or in Finnish and Swedish the ESCO label in that language when grounded. The Finnish
 * templates keep `{phrase}` in a position where the base form reads naturally.
 * When no label in the conversation language exists, use `GENERIC_PROBE` instead.
 */
export const PROBE_QUESTIONS: Record<UiLang, string[]> = {
  en: [
    "Could you give one example of {phrase} from your own work? You can also skip this.",
    "You mentioned {phrase}. Could you tell me about one time you did that yourself?",
    "Could you describe one situation where {phrase} was part of your work? You can also skip this.",
  ],
  fi: [
    "Voisitko kertoa yhden esimerkin tilanteesta, jossa tarvitsit tätä: {phrase}? Voit myös ohittaa tämän.",
    "Puhuit aiheesta {phrase}. Voisitko kertoa yhdestä kerrasta, kun teit sitä itse?",
    "Kun mietit aihetta {phrase}, mikä olisi yksi esimerkki omasta työstäsi? Voit myös ohittaa tämän.",
  ],
  sv: [
    "Kan du ge ett exempel på när du arbetade med {phrase}? Du kan också hoppa över det här.",
    "Du nämnde {phrase}. Kan du berätta om ett tillfälle då du gjorde det själv?",
    "Kan du beskriva en situation där {phrase} var en del av ditt arbete? Du kan också hoppa över det här.",
  ],
};

/** The spec's probe without a phrase, for when no label in the conversation language exists. */
export const GENERIC_PROBE: Record<UiLang, string> = {
  en: "Could you give one example of when you did that? You can also skip this.",
  fi: "Voisitko kertoa yhden esimerkin siitä? Voit myös ohittaa tämän.",
  sv: "Kan du ge ett exempel på när du gjorde det? Du kan också hoppa över det här.",
};

/**
 * Whole-turn commands for the pre-check (interview.md 6.2). Match case-insensitively after
 * trimming punctuation. Stop and skip entries have at most 4 words, delete entries at most 6,
 * matching the pre-check's length limits.
 */
export const COMMAND_WORDS: Record<UiLang, { stop: string[]; skip: string[]; delete: string[] }> = {
  en: {
    stop: ["stop", "end", "quit", "finish", "let's stop", "i want to stop", "that's enough", "stop the interview"],
    skip: ["skip", "next", "pass", "skip this", "skip this one", "next question", "rather not say", "i'd rather not say"],
    delete: ["delete this", "delete that", "remove that", "remove this", "delete my last answer", "remove my last answer", "scratch that"],
  },
  fi: {
    stop: ["lopeta", "lopetetaan", "riittää", "lopetetaan tähän", "haluan lopettaa", "tämä riittää", "lopetetaan haastattelu"],
    skip: ["ohita", "seuraava", "en halua vastata", "ohitetaan", "ohita tämä", "seuraava kysymys", "jätetään väliin", "en halua kertoa"],
    delete: ["poista tuo", "poista se", "poista tämä", "poista edellinen", "poista edellinen vastaus", "poista viimeisin vastaus", "pyyhi tuo"],
  },
  sv: {
    stop: ["sluta", "stopp", "avsluta", "vi slutar", "vi slutar här", "jag vill sluta", "det räcker", "avsluta intervjun"],
    skip: ["hoppa över", "nästa", "pass", "nästa fråga", "hoppa över den", "jag vill inte svara", "stå över"],
    delete: ["ta bort det", "ta bort det där", "radera det", "radera det där", "stryk det", "ta bort mitt senaste svar", "radera mitt senaste svar"],
  },
};

/** Filler tokens: a turn made only of these counts as empty (pre-check `repair`). */
export const FILLER_WORDS: Record<UiLang, string[]> = {
  en: ["um", "uh", "hmm", "erm", "er", "mm"],
  fi: ["öö", "ööh", "niinku", "tota", "tuota", "öh"],
  sv: ["eh", "öh", "ehm", "hmm", "mm", "alltså"],
};

/**
 * Stopwords for `detectLang` (interview.md 6.6). The English and Finnish lists are the spec's;
 * the Swedish list is new. The three lists share no word.
 */
export const STOPWORDS: Record<UiLang, string[]> = {
  en: ["the", "and", "is", "i", "was", "to", "of", "in", "that", "with", "my", "it", "for"],
  fi: ["ja", "on", "olen", "oli", "olin", "että", "ei", "mutta", "kun", "myös", "se", "minä", "mä", "tein", "työ", "siinä", "kanssa"],
  sv: ["och", "är", "jag", "att", "det", "som", "med", "min", "mitt", "för", "inte", "har", "på", "av", "också", "när", "hade", "jobbade"],
};

/** The reply-language sentence placed in the (English) live prompt for each detected language. */
export const REPLY_LANGUAGE_INSTRUCTION: Record<UiLang | "other", string> = {
  en: "Reply in English.",
  fi: "Reply in Finnish.",
  sv: "Reply in Swedish.",
  other: "Reply in the same language as the person's last message.",
};
