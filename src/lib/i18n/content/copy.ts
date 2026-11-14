/**
 * Talent-side interface microcopy from docs/specs/copy.md, in English, Finnish and Swedish.
 * Grouped as the spec groups it. `{name}` placeholders are filled with `fmt` from `@/lib/i18n`.
 * Scripted interviewer lines live in `interview-lines.ts`, not here.
 */
import type { Messages } from "@/lib/i18n/types";

/* 1. Consent screen ------------------------------------------------------------------------ */

const consentEn = {
  title: "Before we start",
  intro:
    "You'll have a short conversation with an AI interviewer about your work. It takes notes, and you decide what to keep.",
  pointAi: "The interviewer is an AI. It does not score you or judge your answers.",
  pointReview:
    "The notes are yours. At the end you check them, change or remove anything, and approve them yourself. Nothing is used before that.",
  pointPrivate: "Companies never see your name unless you agree to meet them.",
  pointDontShare: "You don't need to tell us your age, background, health, family or nationality.",
  pointModels: "Your words are processed by AI models from {modelProviders}.",
  checkInterview: "I agree to the interview and to my notes being stored so I can review them.",
  checkVoice:
    "Use my voice. Audio is turned into text by {processor}, which may keep it under its own terms. WorkEspoo does not store audio.",
  checkVoiceServer:
    "Use my voice. Audio goes to WorkEspoo's own server, is turned into text there and is deleted straight away. It is not stored and no other company receives it.",
  checkVoiceHelp: "Leave this unticked to type instead.",
  checkLiveDemo: "I understand this is a live demo. Everything from this session is deleted after 24 hours.",
  language: "Language for the interview",
  languageHelp: "You can switch language at any time just by speaking or writing in it.",
  cvLabel: "Add a CV (optional)",
  cvHelp: "It's only used to suggest up to two questions, then deleted. Your notes come from what you say.",
  linkHow: "How this works",
  start: "Start the conversation",
  prototype: "Hackathon prototype, not an official City of Espoo service.",
};

export const consentCopy = {
  en: consentEn,
  fi: {
    title: "Ennen kuin aloitetaan",
    intro:
      "Käyt lyhyen keskustelun tekoälyhaastattelijan kanssa työstäsi. Se tekee muistiinpanoja, ja sinä päätät, mitä niistä jää.",
    pointAi: "Haastattelija on tekoäly. Se ei pisteytä sinua eikä arvioi vastauksiasi.",
    pointReview:
      "Muistiinpanot ovat sinun. Lopuksi tarkistat ne, muutat tai poistat mitä haluat ja hyväksyt ne itse. Mitään ei käytetä ennen sitä.",
    pointPrivate: "Yritykset eivät näe nimeäsi, ellet itse suostu tapaamaan niitä.",
    pointDontShare: "Sinun ei tarvitse kertoa ikääsi, taustaasi, terveyttäsi, perhettäsi tai kansalaisuuttasi.",
    pointModels: "Sanojasi käsittelevät tekoälymallit, joita tarjoaa {modelProviders}.",
    checkInterview: "Hyväksyn haastattelun ja sen, että muistiinpanoni tallennetaan, jotta voin tarkistaa ne.",
    checkVoice:
      "Haluan vastata puhumalla. Puheen muuttaa tekstiksi {processor}, joka voi säilyttää sen omien ehtojensa mukaan. WorkEspoo ei tallenna ääntä.",
    checkVoiceServer:
      "Haluan vastata puhumalla. Ääni lähetetään WorkEspoon omalle palvelimelle, muutetaan siellä tekstiksi ja poistetaan heti. Ääntä ei tallenneta, eikä mikään muu yritys saa sitä.",
    checkVoiceHelp: "Jätä tämä valitsematta, jos haluat mieluummin kirjoittaa.",
    checkLiveDemo: "Ymmärrän, että tämä on livedemo. Kaikki tämän istunnon tiedot poistetaan 24 tunnin kuluttua.",
    language: "Haastattelun kieli",
    languageHelp: "Voit vaihtaa kieltä milloin tahansa: puhu tai kirjoita vain sillä kielellä.",
    cvLabel: "Lisää CV (vapaaehtoinen)",
    cvHelp:
      "Sitä käytetään vain enintään kahden kysymyksen ehdottamiseen, ja sen jälkeen se poistetaan. Muistiinpanot syntyvät siitä, mitä itse kerrot.",
    linkHow: "Näin palvelu toimii",
    start: "Aloita keskustelu",
    prototype: "Hackathon-prototyyppi, ei Espoon kaupungin virallinen palvelu.",
  },
  sv: {
    title: "Innan vi börjar",
    intro:
      "Du får ett kort samtal med en AI-intervjuare om ditt arbete. Den antecknar, och du bestämmer vad som ska sparas.",
    pointAi: "Intervjuaren är en AI. Den poängsätter dig inte och bedömer inte dina svar.",
    pointReview:
      "Anteckningarna är dina. I slutet går du igenom dem, ändrar eller tar bort det du vill och godkänner dem själv. Ingenting används innan dess.",
    pointPrivate: "Företag ser aldrig ditt namn om du inte själv går med på att träffa dem.",
    pointDontShare: "Du behöver inte berätta din ålder, bakgrund, hälsa, familj eller nationalitet.",
    pointModels: "Dina ord behandlas av AI-modeller från {modelProviders}.",
    checkInterview: "Jag godkänner intervjun och att mina anteckningar sparas så att jag kan gå igenom dem.",
    checkVoice:
      "Jag vill svara med rösten. Talet görs om till text av {processor}, som kan spara det enligt sina egna villkor. WorkEspoo sparar inte ljud.",
    checkVoiceServer:
      "Jag vill svara med rösten. Ljudet skickas till WorkEspoos egen server, görs om till text där och raderas direkt. Ljudet sparas inte, och inget annat företag får det.",
    checkVoiceHelp: "Lämna rutan tom om du hellre vill skriva.",
    checkLiveDemo: "Jag förstår att det här är en livedemo. Allt från den här sessionen raderas efter 24 timmar.",
    language: "Språk för intervjun",
    languageHelp: "Du kan byta språk när som helst genom att bara tala eller skriva på det.",
    cvLabel: "Lägg till ett CV (frivilligt)",
    cvHelp:
      "Det används bara för att föreslå högst två frågor och raderas sedan. Anteckningarna bygger på det du själv berättar.",
    linkHow: "Så fungerar det",
    start: "Starta samtalet",
    prototype: "Hackathonprototyp, inte en officiell tjänst från Esbo stad.",
  },
} satisfies Messages<typeof consentEn>;

/* 2 and 3. AI disclosure line and interview screen ----------------------------------------- */

const interviewEn = {
  aiDisclosure: "You're talking with an AI. It takes notes; you review and approve them at the end.",
  hold: "Hold to talk",
  release: "Release to send",
  listening: "Listening…",
  thinking: "Writing a question…",
  switchText: "Type instead",
  switchVoice: "Talk instead",
  textPlaceholder: "Write your answer",
  send: "Send",
  skip: "Skip question",
  stop: "Stop",
  stopConfirm: "Stop the interview? You can still review the notes made so far.",
  progress: "Question {n} of {total}",
  hintNoisy: "In a noisy place, hold the button only while you speak.",
  hintInterrupt: "You can press the button to interrupt at any time.",
  notesTitle: "Notes so far",
  notesHelp: "You'll check and edit these at the end.",
  removeAnswer: "Remove this answer",
  jobsLit: "{count} open jobs mention this",
  preparing: "Preparing your notes…",
};

export const interviewCopy = {
  en: interviewEn,
  fi: {
    aiDisclosure: "Keskustelet tekoälyn kanssa. Se tekee muistiinpanoja, jotka tarkistat ja hyväksyt lopuksi.",
    hold: "Pidä pohjassa ja puhu",
    release: "Päästä irti, niin viesti lähtee",
    listening: "Kuuntelen…",
    thinking: "Kirjoitan kysymystä…",
    switchText: "Kirjoita mieluummin",
    switchVoice: "Puhu mieluummin",
    textPlaceholder: "Kirjoita vastauksesi",
    send: "Lähetä",
    skip: "Ohita kysymys",
    stop: "Lopeta",
    stopConfirm: "Lopetetaanko haastattelu? Voit silti tarkistaa tähänastiset muistiinpanot.",
    progress: "Kysymys {n} / {total}",
    hintNoisy: "Jos ympärilläsi on melua, pidä nappia pohjassa vain puhuessasi.",
    hintInterrupt: "Voit keskeyttää milloin tahansa painamalla nappia.",
    notesTitle: "Muistiinpanot tähän asti",
    notesHelp: "Tarkistat ja muokkaat näitä lopuksi.",
    removeAnswer: "Poista tämä vastaus",
    jobsLit: "{count} avointa työpaikkaa mainitsee tämän",
    preparing: "Valmistelen muistiinpanojasi…",
  },
  sv: {
    aiDisclosure: "Du pratar med en AI. Den gör anteckningar som du granskar och godkänner i slutet.",
    hold: "Håll in och prata",
    release: "Släpp för att skicka",
    listening: "Lyssnar…",
    thinking: "Skriver en fråga…",
    switchText: "Skriv i stället",
    switchVoice: "Prata i stället",
    textPlaceholder: "Skriv ditt svar",
    send: "Skicka",
    skip: "Hoppa över frågan",
    stop: "Sluta",
    stopConfirm: "Vill du avsluta intervjun? Du kan fortfarande gå igenom anteckningarna hittills.",
    progress: "Fråga {n} av {total}",
    hintNoisy: "Om det är bullrigt omkring dig, håll bara in knappen medan du pratar.",
    hintInterrupt: "Du kan avbryta när som helst genom att trycka på knappen.",
    notesTitle: "Anteckningar hittills",
    notesHelp: "Du går igenom och redigerar dem i slutet.",
    removeAnswer: "Ta bort det här svaret",
    jobsLit: "{count} lediga jobb nämner det här",
    preparing: "Förbereder dina anteckningar…",
  },
} satisfies Messages<typeof interviewEn>;

/* 4. Card review --------------------------------------------------------------------------- */

const cardEn = {
  title: "Your Signal Card",
  intro:
    "These are notes from your conversation. Check them, change anything, and approve only what you're happy with.",
  handle: "Companies will see you as {handle}.",
  groupSkill: "What I do",
  groupTool: "Tools",
  groupKnowledge: "Know-how",
  groupDomain: "Fields",
  yourWords: "Your words",
  companySees: "Shown to companies as",
  renderingLabel:
    "Written by AI from your own words. Companies don't see your original words, your language or whether you spoke or typed.",
  noEsco: "No ESCO match. That's fine; it stays on your card.",
  edit: "Edit",
  remove: "Remove",
  undo: "Undo",
  removed: "Removed.",
  add: "Add your own",
  addPhrase: "What can you do? (a few words)",
  addWords: "In your own words (optional)",
  addWordsHelp: "One to three sentences about when you did it.",
  addedByYou: "Added by you",
  sensitiveWarning: "Companies will see this. You don't need to share it.",
  transcriptTitle: "Your answers",
  transcriptHelp: "Speech recognition makes mistakes, especially with accents. Tap a sentence to fix it.",
  transcriptFix: "Fix this sentence",
  transcriptSave: "Save",
  transcriptCorrected: "Corrected",
  transcriptLostEvidence: "This note had no words left, so it was removed.",
  lookingForTitle: "What you're looking for",
  lookingForHelp: "All optional. Companies can see this.",
  lookingForRoles: "Kinds of work",
  lookingForWorkMode: "Where you'd like to work",
  workModeOnsite: "On site",
  workModeHybrid: "Hybrid",
  workModeRemote: "Remote",
  workModeAny: "Any",
  lookingForStart: "When you could start",
  startNow: "Now",
  startWithin1Month: "Within a month",
  startWithin3Months: "Within three months",
  startLater: "Later",
  lookingForLanguages: "Languages you'd like to work in",
  previewTitle: "What companies see",
  purgeNotice: "This is a live demo session. Everything is deleted {time}.",
};

export const cardCopy = {
  en: cardEn,
  fi: {
    title: "Signal Card -korttisi",
    intro:
      "Nämä ovat muistiinpanot keskustelustasi. Tarkista ne, muuta mitä haluat ja hyväksy vain se, mihin olet tyytyväinen.",
    handle: "Yritykset näkevät sinut nimellä {handle}.",
    groupSkill: "Mitä teen",
    groupTool: "Työkalut",
    groupKnowledge: "Osaaminen",
    groupDomain: "Alat",
    yourWords: "Omat sanasi",
    companySees: "Yritykset näkevät tämän näin",
    renderingLabel:
      "Tekoäly kirjoitti tämän omien sanojesi pohjalta. Yritykset eivät näe alkuperäisiä sanojasi, kieltäsi eivätkä sitä, puhuitko vai kirjoititko.",
    noEsco: "Ei ESCO-vastinetta. Se ei haittaa, tämä pysyy kortillasi.",
    edit: "Muokkaa",
    remove: "Poista",
    undo: "Kumoa",
    removed: "Poistettu.",
    add: "Lisää oma",
    addPhrase: "Mitä osaat? (muutama sana)",
    addWords: "Omin sanoin (vapaaehtoinen)",
    addWordsHelp: "Yhdestä kolmeen lausetta siitä, milloin teit sitä.",
    addedByYou: "Lisäsit itse",
    sensitiveWarning: "Yritykset näkevät tämän. Sinun ei tarvitse kertoa sitä.",
    transcriptTitle: "Vastauksesi",
    transcriptHelp: "Puheentunnistus tekee virheitä, varsinkin aksenttien kanssa. Napauta lausetta, niin voit korjata sen.",
    transcriptFix: "Korjaa lause",
    transcriptSave: "Tallenna",
    transcriptCorrected: "Korjattu",
    transcriptLostEvidence: "Tähän muistiinpanoon ei jäänyt yhtään sanaa, joten se poistettiin.",
    lookingForTitle: "Mitä etsit",
    lookingForHelp: "Kaikki on vapaaehtoista. Yritykset näkevät nämä.",
    lookingForRoles: "Millaista työtä",
    lookingForWorkMode: "Missä haluaisit tehdä töitä",
    workModeOnsite: "Työpaikalla",
    workModeHybrid: "Osin etänä",
    workModeRemote: "Etänä",
    workModeAny: "Mikä tahansa",
    lookingForStart: "Milloin voisit aloittaa",
    startNow: "Heti",
    startWithin1Month: "Kuukauden sisällä",
    startWithin3Months: "Kolmen kuukauden sisällä",
    startLater: "Myöhemmin",
    lookingForLanguages: "Kielet, joilla haluaisit tehdä töitä",
    previewTitle: "Mitä yritykset näkevät",
    purgeNotice: "Tämä on livedemo. Kaikki poistetaan {time}.",
  },
  sv: {
    title: "Ditt Signal Card",
    intro:
      "Det här är anteckningar från ditt samtal. Gå igenom dem, ändra det du vill och godkänn bara det du är nöjd med.",
    handle: "Företag ser dig som {handle}.",
    groupSkill: "Vad jag gör",
    groupTool: "Verktyg",
    groupKnowledge: "Kunnande",
    groupDomain: "Branscher",
    yourWords: "Dina ord",
    companySees: "Så här ser företag det",
    renderingLabel:
      "Skrivet av AI utifrån dina egna ord. Företag ser inte dina ursprungliga ord, vilket språk du använde eller om du pratade eller skrev.",
    noEsco: "Ingen motsvarighet i ESCO. Det gör inget, det står kvar på ditt kort.",
    edit: "Redigera",
    remove: "Ta bort",
    undo: "Ångra",
    removed: "Borttaget.",
    add: "Lägg till eget",
    addPhrase: "Vad kan du? (några ord)",
    addWords: "Med dina egna ord (frivilligt)",
    addWordsHelp: "En till tre meningar om när du gjorde det.",
    addedByYou: "Tillagt av dig",
    sensitiveWarning: "Företag kommer att se det här. Du behöver inte berätta det.",
    transcriptTitle: "Dina svar",
    transcriptHelp: "Taligenkänningen gör misstag, särskilt när man har brytning. Tryck på en mening för att rätta den.",
    transcriptFix: "Rätta meningen",
    transcriptSave: "Spara",
    transcriptCorrected: "Rättad",
    transcriptLostEvidence: "Den här anteckningen hade inga ord kvar, så den togs bort.",
    lookingForTitle: "Vad du söker",
    lookingForHelp: "Allt är frivilligt. Företag kan se det här.",
    lookingForRoles: "Typer av arbete",
    lookingForWorkMode: "Var du vill arbeta",
    workModeOnsite: "På arbetsplatsen",
    workModeHybrid: "Delvis på distans",
    workModeRemote: "På distans",
    workModeAny: "Spelar ingen roll",
    lookingForStart: "När du kan börja",
    startNow: "Nu",
    startWithin1Month: "Inom en månad",
    startWithin3Months: "Inom tre månader",
    startLater: "Senare",
    lookingForLanguages: "Språk du vill arbeta på",
    previewTitle: "Vad företag ser",
    purgeNotice: "Det här är en livedemo. Allt raderas {time}.",
  },
} satisfies Messages<typeof cardEn>;

/* 5. Approval ------------------------------------------------------------------------------ */

const approvalEn = {
  approve: "Approve my card",
  approvePreparing: "Preparing company view…",
  approveEmpty: "Keep at least one note, or add your own, to approve.",
  approved: "Approved. You can change your card at any time.",
  editAgain: "Edit my card",
  editAgainHelp: "Your approved card stays in use until you approve the new version.",
  discardDraft: "Discard changes",
};

export const approvalCopy = {
  en: approvalEn,
  fi: {
    approve: "Hyväksy korttini",
    approvePreparing: "Valmistelen yritysnäkymää…",
    approveEmpty: "Jätä vähintään yksi muistiinpano tai lisää oma, niin voit hyväksyä kortin.",
    approved: "Hyväksytty. Voit muuttaa korttiasi milloin tahansa.",
    editAgain: "Muokkaa korttiani",
    editAgainHelp: "Hyväksytty korttisi on käytössä, kunnes hyväksyt uuden version.",
    discardDraft: "Hylkää muutokset",
  },
  sv: {
    approve: "Godkänn mitt kort",
    approvePreparing: "Förbereder företagsvyn…",
    approveEmpty: "Behåll minst en anteckning, eller lägg till en egen, för att kunna godkänna.",
    approved: "Godkänt. Du kan ändra ditt kort när som helst.",
    editAgain: "Redigera mitt kort",
    editAgainHelp: "Ditt godkända kort används tills du godkänner den nya versionen.",
    discardDraft: "Släng ändringarna",
  },
} satisfies Messages<typeof approvalEn>;

/* 6. Pool opt-in --------------------------------------------------------------------------- */

const poolEn = {
  title: "Can Espoo suggest you to companies?",
  body: "If you say yes, your approved card (without your name) can be suggested to companies at this event. An Espoo organiser checks every suggestion. Your name is shared only if a company asks to meet you and you agree.",
  liveDemo: "This is a live demo session, so everything is still deleted after 24 hours.",
  yes: "Yes, suggest me",
  no: "Not now",
  noHelp: "You'll still see open jobs that match your card.",
  statusIn: "You're in the pool.",
  statusOut: "You're not in the pool.",
  leave: "Leave the pool",
  leaveConfirm:
    "Leave the pool? Pending suggestions are removed. Meetings you already agreed to stay until you cancel them.",
};

export const poolCopy = {
  en: poolEn,
  fi: {
    title: "Saako Espoo ehdottaa sinua yrityksille?",
    body: "Jos vastaat kyllä, hyväksyttyä korttiasi voidaan ehdottaa tapahtuman yrityksille ilman nimeäsi. Espoon järjestäjä tarkistaa jokaisen ehdotuksen. Nimesi kerrotaan vain, jos yritys pyytää tapaamista ja suostut siihen.",
    liveDemo: "Tämä on livedemo, joten kaikki poistetaan silti 24 tunnin kuluttua.",
    yes: "Kyllä, saa ehdottaa",
    no: "Ei nyt",
    noHelp: "Näet silti korttiisi sopivat avoimet työpaikat.",
    statusIn: "Olet mukana ehdotettavien joukossa.",
    statusOut: "Et ole mukana ehdotettavien joukossa.",
    leave: "Poistu joukosta",
    leaveConfirm:
      "Poistutko joukosta? Odottavat ehdotukset poistetaan. Jo sovitut tapaamiset pysyvät voimassa, kunnes perut ne.",
  },
  sv: {
    title: "Får Esbo föreslå dig för företag?",
    body: "Om du svarar ja kan ditt godkända kort föreslås för företagen på evenemanget, utan ditt namn. En arrangör från Esbo går igenom varje förslag. Ditt namn delas bara om ett företag vill träffa dig och du går med på det.",
    liveDemo: "Det här är en livedemo, så allt raderas ändå efter 24 timmar.",
    yes: "Ja, föreslå mig",
    no: "Inte nu",
    noHelp: "Du ser fortfarande lediga jobb som passar ditt kort.",
    statusIn: "Du är med bland dem som kan föreslås.",
    statusOut: "Du är inte med bland dem som kan föreslås.",
    leave: "Gå ur gruppen",
    leaveConfirm:
      "Vill du gå ur gruppen? Förslag som väntar tas bort. Möten som du redan har gått med på gäller tills du ställer in dem.",
  },
} satisfies Messages<typeof poolEn>;

/* 7. Your data ----------------------------------------------------------------------------- */

const dataEn = {
  export: "Download my data",
  exportHelp: "A file with your answers, your card, your job applications with their ratings, and your consents.",
  delete: "Delete everything",
  deleteConfirm: "Delete your answers, your card, your job applications and everything linked to them? This can't be undone.",
  deleteYes: "Yes, delete everything",
  deleted: "Everything has been deleted.",
};

export const dataCopy = {
  en: dataEn,
  fi: {
    export: "Lataa tietoni",
    exportHelp: "Tiedosto, jossa ovat vastauksesi, korttisi, työhakemuksesi arvioineen ja suostumuksesi.",
    delete: "Poista kaikki",
    deleteConfirm: "Poistetaanko vastauksesi, korttisi, työhakemuksesi ja kaikki niihin liittyvä? Tätä ei voi perua.",
    deleteYes: "Kyllä, poista kaikki",
    deleted: "Kaikki on poistettu.",
  },
  sv: {
    export: "Ladda ner mina uppgifter",
    exportHelp: "En fil med dina svar, ditt kort, dina jobbansökningar med deras bedömningar och dina samtycken.",
    delete: "Radera allt",
    deleteConfirm: "Vill du radera dina svar, ditt kort, dina jobbansökningar och allt som hör till dem? Det går inte att ångra.",
    deleteYes: "Ja, radera allt",
    deleted: "Allt har raderats.",
  },
} satisfies Messages<typeof dataEn>;

/* 8. Errors and empty states --------------------------------------------------------------- */

const errorEn = {
  micDenied: "We can't use your microphone. You can allow it in your browser settings, or type instead.",
  micUnsupported: "Voice doesn't work in this browser. You can type instead.",
  voiceFailed: "We couldn't turn that into text. Please try again, or type it.",
  network: "The connection dropped. Your answers so far are saved.",
  retry: "Try again",
  modelSlow: "This is taking longer than usual. One moment.",
  synthesis: "We couldn't prepare all your notes. You can add your own and approve when ready.",
  save: "We couldn't save that change. Please try again.",
  cvFailed: "We couldn't read the CV. That's fine, the interview works without it.",
  cvTooLarge: "That file is too large. The limit is {limit}.",
  sessionExpired: "This session has ended and its data has been deleted.",
  sessionIdle: "The conversation paused because nothing happened for a while. You can start a new one.",
  cardEmpty: "No notes yet. Add your own to get started.",
};

export const errorCopy = {
  en: errorEn,
  fi: {
    micDenied: "Mikrofonia ei voi käyttää. Voit sallia sen selaimen asetuksista tai kirjoittaa vastauksesi.",
    micUnsupported: "Puhe ei toimi tässä selaimessa. Voit kirjoittaa vastauksesi.",
    voiceFailed: "Emme saaneet puhetta muutettua tekstiksi. Yritä uudelleen tai kirjoita vastauksesi.",
    network: "Yhteys katkesi. Tähänastiset vastauksesi on tallennettu.",
    retry: "Yritä uudelleen",
    modelSlow: "Tämä kestää tavallista kauemmin. Hetki vain.",
    synthesis: "Emme saaneet kaikkia muistiinpanoja valmiiksi. Voit lisätä omia ja hyväksyä, kun olet valmis.",
    save: "Muutosta ei saatu tallennettua. Yritä uudelleen.",
    cvFailed: "CV:tä ei saatu luettua. Se ei haittaa, haastattelu toimii ilman sitä.",
    cvTooLarge: "Tiedosto on liian suuri. Enimmäiskoko on {limit}.",
    sessionExpired: "Tämä istunto on päättynyt ja sen tiedot on poistettu.",
    sessionIdle: "Keskustelu keskeytyi, koska mitään ei tapahtunut hetkeen. Voit aloittaa uuden.",
    cardEmpty: "Ei vielä muistiinpanoja. Aloita lisäämällä oma.",
  },
  sv: {
    micDenied: "Vi kan inte använda din mikrofon. Du kan tillåta den i webbläsarens inställningar eller skriva i stället.",
    micUnsupported: "Röst fungerar inte i den här webbläsaren. Du kan skriva i stället.",
    voiceFailed: "Vi kunde inte göra om det till text. Försök igen eller skriv det.",
    network: "Anslutningen bröts. Dina svar hittills är sparade.",
    retry: "Försök igen",
    modelSlow: "Det här tar längre tid än vanligt. Ett ögonblick.",
    synthesis: "Vi kunde inte förbereda alla dina anteckningar. Du kan lägga till egna och godkänna när du är klar.",
    save: "Vi kunde inte spara ändringen. Försök igen.",
    cvFailed: "Vi kunde inte läsa ditt CV. Det gör inget, intervjun fungerar utan det.",
    cvTooLarge: "Filen är för stor. Gränsen är {limit}.",
    sessionExpired: "Den här sessionen har avslutats och uppgifterna har raderats.",
    sessionIdle: "Samtalet pausades eftersom ingenting hände på en stund. Du kan starta ett nytt.",
    cardEmpty: "Inga anteckningar ännu. Börja med att lägga till en egen.",
  },
} satisfies Messages<typeof errorEn>;
