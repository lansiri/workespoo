import type { Messages } from "@/lib/i18n/types";

type NeedMessages = {
  bannerLead: string;
  bannerBody: string;
  bannerPrototype: string;
  yourNeed: string;
  draftedFrom: string;
  statusDraft: string;
  statusConfirmed: string;
  statusStale: string;
  intro: string;
  noRequirements: string;
  kindMust: string;
  kindNice: string;
  categorySkill: string;
  categoryLanguage: string;
  categoryEducation: string;
  categoryExperience: string;
  categoryAuthorisation: string;
  categoryOther: string;
  sourcePosting: string;
  sourceCompany: string;
  statutoryNote: string;
  poolAsOf: string;
  poolNormal: string;
  poolSelfDeclared: string;
  poolStatutory: string;
  poolWholePool: string;
  poolEmpty: string;
  questionWhy: string;
  keepMust: string;
  makeNice: string;
  changeWording: string;
  removeIt: string;
  newWording: string;
  saveWording: string;
  answeredKeep: string;
  answeredMakeNice: string;
  answeredReworded: string;
  confirmNeed: string;
  confirming: string;
  confirmedNote: string;
  readOnlyStale: string;
  errorGeneric: string;
  errorProtectedText: string;
  errorProtectedHint: string;
  // /dev/s2
  devTitle: string;
  devSignIn: string;
  devPostings: string;
  devNoPostings: string;
  devDraft: string;
  devRedraft: string;
  devCompany: string;
  devNoCompany: string;
  devDrafting: string;
  devOpenCard: string;
  devOpenCompanyPage: string;
  devStatus: string;
  devVersion: string;
  devNoCard: string;
};

export const needMessages = {
  en: {
    bannerLead: "{name}.",
    bannerBody: "Based on a real public posting. The employer's name is hidden. The people below are synthetic.",
    bannerPrototype: "WorkEspoo is a hackathon prototype, not an official City of Espoo service.",
    yourNeed: "Your need",
    draftedFrom: "Drafted from your public posting on {date}",
    statusDraft: "Please check",
    statusConfirmed: "Confirmed {date}",
    statusStale: "Out of date",
    intro:
      "Must-haves never remove anyone from your picks. We show what the conversation did not cover as 'not mentioned', so you can ask about it when you meet.",
    noRequirements: "No requirements were found in the posting. Please check the posting.",
    kindMust: "Must-have",
    kindNice: "Nice-to-have",
    categorySkill: "Skill",
    categoryLanguage: "Language",
    categoryEducation: "Education",
    categoryExperience: "Experience",
    categoryAuthorisation: "Licence or authorisation",
    categoryOther: "Other",
    sourcePosting: "From your posting",
    sourceCompany: "Added by you",
    statutoryNote: "Set by law or regulation. Not questioned here; the employer checks it at hiring.",
    poolAsOf: "as of {time}",
    poolNormal:
      "**{speakTo} of {relevant}** people in the pool whose cards relate to this role speak to this. A hard filter on it would set aside **{exclude}**. They did not mention it in a short conversation; that does not mean they lack it. No filter is applied.",
    poolSelfDeclared: "({selfDeclaredOnly} of them by naming it as a work language.)",
    poolStatutory:
      "**{speakTo} of {relevant}** speak to this. Set by law or regulation; the employer checks it at hiring.",
    poolWholePool:
      "Nobody in the pool relates to this role yet. Across the whole pool of {relevant}, **{speakTo}** speak to this requirement.",
    poolEmpty: "Nobody has joined the pool yet, so there is nothing to count.",
    questionWhy: "Why we ask: {why}",
    keepMust: "Keep as must-have",
    makeNice: "Make it nice-to-have",
    changeWording: "Change the wording",
    removeIt: "Remove it",
    newWording: "New wording",
    saveWording: "Save the new wording",
    answeredKeep: "You kept this as a must-have.",
    answeredMakeNice: "You made this a nice-to-have.",
    answeredReworded: "You changed the wording.",
    confirmNeed: "Confirm this need",
    confirming: "Confirming…",
    confirmedNote: "You confirmed this need. You can still answer questions above.",
    readOnlyStale: "The posting has closed, so this need can no longer be changed.",
    errorGeneric: "Something went wrong. Please try again.",
    errorProtectedText:
      "This describes a personal characteristic, not the work. Describe the skill or language level the work needs instead.",
    errorProtectedHint: "Try 'fluent working Finnish'.",
    devTitle: "Need Cards (test page)",
    devSignIn: "Organiser sign-in is required to use this page.",
    devPostings: "Recent postings",
    devNoPostings: "No postings yet.",
    devDraft: "Draft Need Card",
    devRedraft: "Draft again",
    devCompany: "Company",
    devNoCompany: "None (only explains the posting)",
    devDrafting: "Drafting…",
    devOpenCard: "Organiser view of the card",
    devOpenCompanyPage: "Company page",
    devStatus: "Status",
    devVersion: "Version",
    devNoCard: "No Need Card yet",
  },
  fi: {
    bannerLead: "{name}.",
    bannerBody:
      "Perustuu todelliseen julkiseen työpaikkailmoitukseen. Työnantajan nimi on piilotettu. Alla olevat henkilöt ovat synteettisiä.",
    bannerPrototype: "WorkEspoo on hackathon-prototyyppi, ei Espoon kaupungin virallinen palvelu.",
    yourNeed: "Tarpeenne",
    draftedFrom: "Laadittu julkisesta työpaikkailmoituksestanne {date}",
    statusDraft: "Tarkistakaa",
    statusConfirmed: "Vahvistettu {date}",
    statusStale: "Vanhentunut",
    intro:
      "Välttämättömät vaatimukset eivät koskaan poista ketään ehdotuksistanne. Se, mitä keskustelussa ei käsitelty, näytetään merkinnällä 'ei mainittu', jotta voitte kysyä siitä tapaamisessa.",
    noRequirements: "Ilmoituksesta ei löytynyt vaatimuksia. Tarkistakaa ilmoitus.",
    kindMust: "Välttämätön",
    kindNice: "Eduksi",
    categorySkill: "Osaaminen",
    categoryLanguage: "Kieli",
    categoryEducation: "Koulutus",
    categoryExperience: "Kokemus",
    categoryAuthorisation: "Lupa tai pätevyys",
    categoryOther: "Muu",
    sourcePosting: "Ilmoituksestanne",
    sourceCompany: "Lisännyt te",
    statutoryNote:
      "Laissa tai määräyksissä säädetty. Siitä ei kysytä tässä; työnantaja tarkistaa sen palkattaessa.",
    poolAsOf: "tilanne {time}",
    poolNormal:
      "Poolin henkilöistä, joiden kortit liittyvät tähän tehtävään, **{speakTo}/{relevant}** kertoo tähän liittyvästä osaamisesta. Tiukka suodatin sulkisi pois **{exclude}** henkilöä. He eivät maininneet asiaa lyhyessä keskustelussa; se ei tarkoita, ettei heillä sitä ole. Suodatinta ei käytetä.",
    poolSelfDeclared: "({selfDeclaredOnly} heistä ilmoittamalla sen työkielekseen.)",
    poolStatutory:
      "**{speakTo}/{relevant}** kertoo tähän liittyvästä osaamisesta. Laissa tai määräyksissä säädetty; työnantaja tarkistaa sen palkattaessa.",
    poolWholePool:
      "Kukaan poolissa ei vielä liity tähän tehtävään. Koko poolin {relevant} henkilöstä **{speakTo}** kertoo tähän vaatimukseen liittyvästä osaamisesta.",
    poolEmpty: "Pooliin ei ole vielä liittynyt ketään, joten laskettavaa ei ole.",
    questionWhy: "Miksi kysymme: {why}",
    keepMust: "Pidä välttämättömänä",
    makeNice: "Muuta eduksi",
    changeWording: "Muuta sanamuotoa",
    removeIt: "Poista vaatimus",
    newWording: "Uusi sanamuoto",
    saveWording: "Tallenna uusi sanamuoto",
    answeredKeep: "Pidätte tämän välttämättömänä.",
    answeredMakeNice: "Muutitte tämän eduksi.",
    answeredReworded: "Muutitte sanamuotoa.",
    confirmNeed: "Vahvista tämä tarve",
    confirming: "Vahvistetaan…",
    confirmedNote: "Olette vahvistaneet tämän tarpeen. Voitte yhä vastata yllä oleviin kysymyksiin.",
    readOnlyStale: "Ilmoitus on sulkeutunut, joten tätä tarvetta ei voi enää muuttaa.",
    errorGeneric: "Jokin meni vikaan. Yrittäkää uudelleen.",
    errorProtectedText:
      "Tämä kuvaa henkilön ominaisuutta, ei työtä. Kuvaa sen sijaan taito tai kielitaito, jota työ vaatii.",
    errorProtectedHint: "Kokeilkaa 'sujuva suomen kielen työkielitaito'.",
    devTitle: "Tarvekortit (testisivu)",
    devSignIn: "Tämä sivu vaatii järjestäjän kirjautumisen.",
    devPostings: "Viimeisimmät ilmoitukset",
    devNoPostings: "Ei vielä ilmoituksia.",
    devDraft: "Luo tarvekortti",
    devRedraft: "Luo uudelleen",
    devCompany: "Yritys",
    devNoCompany: "Ei mitään (selittää vain ilmoituksen)",
    devDrafting: "Luodaan…",
    devOpenCard: "Kortin järjestäjänäkymä",
    devOpenCompanyPage: "Yrityksen sivu",
    devStatus: "Tila",
    devVersion: "Versio",
    devNoCard: "Ei vielä tarvekorttia",
  },
  sv: {
    bannerLead: "{name}.",
    bannerBody:
      "Baserat på en verklig offentlig annons. Arbetsgivarens namn är dolt. Personerna nedan är syntetiska.",
    bannerPrototype: "WorkEspoo är en hackathon-prototyp, inte en officiell tjänst från Esbo stad.",
    yourNeed: "Ert behov",
    draftedFrom: "Skrivet utifrån er offentliga annons den {date}",
    statusDraft: "Granska gärna",
    statusConfirmed: "Bekräftat {date}",
    statusStale: "Föråldrat",
    intro:
      "Krav tar aldrig bort någon från era förslag. Det som samtalet inte berörde visas som 'inte nämnt', så att ni kan fråga om det när ni träffas.",
    noRequirements: "Inga krav hittades i annonsen. Kontrollera annonsen.",
    kindMust: "Krav",
    kindNice: "Meriterande",
    categorySkill: "Kompetens",
    categoryLanguage: "Språk",
    categoryEducation: "Utbildning",
    categoryExperience: "Erfarenhet",
    categoryAuthorisation: "Tillstånd eller behörighet",
    categoryOther: "Övrigt",
    sourcePosting: "Från er annons",
    sourceCompany: "Tillagt av er",
    statutoryNote:
      "Fastställt i lag eller föreskrift. Vi frågar inte om det här; arbetsgivaren kontrollerar det vid anställning.",
    poolAsOf: "per {time}",
    poolNormal:
      "Av de personer i poolen vars kort rör den här rollen berättar **{speakTo} av {relevant}** om något som hör till detta. Ett strikt filter skulle sålla bort **{exclude}**. De nämnde det inte i ett kort samtal; det betyder inte att de saknar det. Inget filter tillämpas.",
    poolSelfDeclared: "({selfDeclaredOnly} av dem genom att ange det som arbetsspråk.)",
    poolStatutory:
      "**{speakTo} av {relevant}** berättar om något som hör till detta. Fastställt i lag eller föreskrift; arbetsgivaren kontrollerar det vid anställning.",
    poolWholePool:
      "Ingen i poolen rör den här rollen ännu. Av hela poolens {relevant} personer berättar **{speakTo}** om något som hör till det här kravet.",
    poolEmpty: "Ingen har gått med i poolen ännu, så det finns inget att räkna.",
    questionWhy: "Varför vi frågar: {why}",
    keepMust: "Behåll som krav",
    makeNice: "Gör det meriterande",
    changeWording: "Ändra formuleringen",
    removeIt: "Ta bort kravet",
    newWording: "Ny formulering",
    saveWording: "Spara den nya formuleringen",
    answeredKeep: "Ni behöll detta som krav.",
    answeredMakeNice: "Ni gjorde detta meriterande.",
    answeredReworded: "Ni ändrade formuleringen.",
    confirmNeed: "Bekräfta det här behovet",
    confirming: "Bekräftar…",
    confirmedNote: "Ni har bekräftat det här behovet. Ni kan fortfarande svara på frågorna ovan.",
    readOnlyStale: "Annonsen har stängts, så det här behovet kan inte längre ändras.",
    errorGeneric: "Något gick fel. Försök igen.",
    errorProtectedText:
      "Det här beskriver en personlig egenskap, inte arbetet. Beskriv i stället den färdighet eller språknivå som arbetet kräver.",
    errorProtectedHint: "Pröva 'flytande arbetsspråk finska'.",
    devTitle: "Behovskort (testsida)",
    devSignIn: "Den här sidan kräver arrangörsinloggning.",
    devPostings: "Senaste annonserna",
    devNoPostings: "Inga annonser ännu.",
    devDraft: "Skapa behovskort",
    devRedraft: "Skapa på nytt",
    devCompany: "Företag",
    devNoCompany: "Inget (förklarar bara annonsen)",
    devDrafting: "Skapar…",
    devOpenCard: "Arrangörsvy av kortet",
    devOpenCompanyPage: "Företagets sida",
    devStatus: "Status",
    devVersion: "Version",
    devNoCard: "Inget behovskort ännu",
  },
} satisfies Messages<NeedMessages>;

export type NeedMessagesText = NeedMessages;
