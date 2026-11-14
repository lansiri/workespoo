import type { Messages } from "@/lib/i18n";

/**
 * The front page: the owner's joke headline stays (from `messages.ts`); these strings replace the
 * "coming soon" lines with the fact that the product is here, and add the three plain sections.
 */
const en = {
  metaTitle: "WorkEspoo: a conversation instead of a CV",
  metaDescription:
    "Can't find a job in the current market?? Try WorkEspoo. A few minutes of conversation with an AI interviewer becomes a Signal Card, built from your own words, and real open jobs that fit.",
  badge: "It's here",
  kicker: "A few minutes of talking or typing. No CV needed, and nothing to fill in.",
  quote: "WorkEspoo actually listens. For more than six seconds.",
  cta: "Start the conversation",
  ctaNote: "The interviewer is an AI. It does not score you or judge your answers.",
  ticker2: "Open now. Start a conversation, not a form.",

  stepsTitle: "How it works",
  stepsLabel: "Step",
  step1Title: "Talk or type for a few minutes",
  step1Body: "An AI interviewer asks a few short questions about your work. It tells you at the start that it is an AI.",
  step2Title: "Check your notes",
  step2Body:
    "Each note on your Signal Card points to sentences you said. You can change or remove any note, and nothing is used until you approve the card.",
  step3Title: "See real open jobs",
  step3Body:
    "Real open jobs that relate to your notes light up as you talk, with the reasons. Companies see you only if you join the pool or apply for one of their jobs. You can apply for a job of the event with a short job interview, which is rated against the ad's requirements.",

  gainTitle: "What companies and organisers get",
  companiesTitle: "Companies",
  companiesBody:
    "Each morning, a short list of people worth a conversation, with the reasons, under neutral nicknames and in no particular order. A must-have in a job ad never removes anyone from the pool. People who apply with a job interview come as a ranked list that an organiser has checked and approved.",
  organisersTitle: "Espoo organisers",
  organisersBody:
    "Every suggestion is drafted for review and approved one person at a time before a company sees it. Each decision goes to the audit log, and names stay hidden until both sides say yes.",

  notTitle: "What the AI does not do",
  not1Title: "It takes notes. It does not score the conversation.",
  not1Body: "Your conversation and your card get no points, levels or percentages, and there are no comments on how you speak or feel. Only a job interview you choose to take is rated, and you are told first.",
  not2Title: "It does not decide who is suggested.",
  not2Body: "A person approves every suggestion. One person at a time. No approve-all.",
  not3Title: "It cannot invent your words.",
  not3Body: "Your sentences are shown exactly as they were transcribed. The AI's wording is shown separately and labelled.",
  nothingScored: "Your conversation is not scored.",
  how: "How this works",
  prototype: "Hackathon prototype, not an official City of Espoo service.",
};

type Strings = Record<keyof typeof en, string>;

const fi: Strings = {
  metaTitle: "WorkEspoo: keskustelu CV:n sijaan",
  metaDescription:
    "Eikö duunia löydy näillä markkinoilla?? Kokeile WorkEspoota. Muutaman minuutin keskustelu tekoälyhaastattelijan kanssa muuttuu Signaalikortiksi, joka rakentuu omista sanoistasi, ja oikeiksi avoimiksi töiksi, jotka sopivat sinulle.",
  badge: "Nyt täällä",
  kicker: "Muutama minuutti puhumista tai kirjoittamista. CV:tä ei tarvita, eikä lomakkeita täytetä.",
  quote: "WorkEspoo oikeasti kuuntelee. Pidempään kuin kuusi sekuntia.",
  cta: "Aloita keskustelu",
  ctaNote: "Haastattelija on tekoäly. Se ei pisteytä sinua eikä arvioi vastauksiasi.",
  ticker2: "Auki nyt. Aloita keskustelu, ei lomaketta.",

  stepsTitle: "Näin se toimii",
  stepsLabel: "Vaihe",
  step1Title: "Puhu tai kirjoita muutama minuutti",
  step1Body: "Tekoälyhaastattelija kysyy muutaman lyhyen kysymyksen työstäsi. Se kertoo heti alussa olevansa tekoäly.",
  step2Title: "Tarkista muistiinpanosi",
  step2Body:
    "Jokainen Signaalikorttisi muistiinpano viittaa lauseisiin, jotka sanoit. Voit muuttaa tai poistaa minkä tahansa muistiinpanon, eikä mitään käytetä ennen kuin hyväksyt kortin.",
  step3Title: "Katso oikeat avoimet työt",
  step3Body:
    "Muistiinpanoihisi liittyvät oikeat avoimet työpaikat syttyvät, kun puhut, perusteluineen. Yritykset näkevät sinut vain, jos liityt joukkoon tai haet niiden työpaikkaa. Voit hakea tapahtuman työpaikkoja lyhyellä työhaastattelulla, joka arvioidaan ilmoituksen vaatimusten perusteella.",

  gainTitle: "Mitä yritykset ja järjestäjät saavat",
  companiesTitle: "Yritykset",
  companiesBody:
    "Joka aamu lyhyen listan ihmisistä, joiden kanssa kannattaa jutella, perusteluineen, neutraalien lempinimien alla ja ilman erityistä järjestystä. Työpaikkailmoituksen pakollinen vaatimus ei koskaan poista ketään joukosta. Työhaastattelulla hakeneet näkyvät yritykselle järjestykseen asetettuna listana, jonka Espoon järjestäjä on tarkistanut ja hyväksynyt.",
  organisersTitle: "Espoon järjestäjät",
  organisersBody:
    "Jokainen ehdotus valmistellaan tarkistettavaksi ja hyväksytään yksi ihminen kerrallaan, ennen kuin yritys näkee sen. Jokainen päätös kirjautuu lokiin, ja nimet pysyvät piilossa, kunnes molemmat sanovat kyllä.",

  notTitle: "Mitä tekoäly ei tee",
  not1Title: "Se tekee muistiinpanoja. Se ei pisteytä keskustelua.",
  not1Body: "Keskustelusi ja korttisi eivät saa pisteitä, tasoja eikä prosentteja, eikä sitä, miten puhut tai miltä sinusta tuntuu, kommentoida. Vain työhaastattelu, jonka itse valitset, arvioidaan, ja siitä kerrotaan ensin.",
  not2Title: "Se ei päätä, kenet ehdotetaan.",
  not2Body: "Ihminen hyväksyy jokaisen ehdotuksen. Yksi ihminen kerrallaan. Ei kaikkien hyväksymistä kerralla.",
  not3Title: "Se ei voi keksiä sanojasi.",
  not3Body: "Lauseesi näytetään täsmälleen niin kuin ne litteroitiin. Tekoälyn sanamuoto näytetään erikseen ja merkittynä.",
  nothingScored: "Keskusteluasi ei pisteytetä.",
  how: "Näin tämä toimii",
  prototype: "Hackathon-prototyyppi, ei Espoon kaupungin virallinen palvelu.",
};

const sv: Strings = {
  metaTitle: "WorkEspoo: ett samtal i stället för ett CV",
  metaDescription:
    "Hittar du inget jobb på dagens marknad?? Testa WorkEspoo. Ett kort samtal med en AI-intervjuare blir ett Signalkort, byggt på dina egna ord, och riktiga lediga jobb som passar.",
  badge: "Nu finns den",
  kicker: "Några minuter av prat eller skrivande. Inget CV behövs och inget formulär att fylla i.",
  quote: "WorkEspoo lyssnar på riktigt. Längre än sex sekunder.",
  cta: "Starta samtalet",
  ctaNote: "Intervjuaren är en AI. Den poängsätter dig inte och bedömer inte dina svar.",
  ticker2: "Öppet nu. Starta ett samtal, inte ett formulär.",

  stepsTitle: "Så fungerar det",
  stepsLabel: "Steg",
  step1Title: "Prata eller skriv i några minuter",
  step1Body: "En AI-intervjuare ställer några korta frågor om ditt arbete. Den säger redan i början att den är en AI.",
  step2Title: "Granska dina anteckningar",
  step2Body:
    "Varje anteckning på ditt Signalkort hänvisar till meningar som du sa. Du kan ändra eller ta bort vilken anteckning som helst, och ingenting används innan du har godkänt kortet.",
  step3Title: "Se riktiga lediga jobb",
  step3Body:
    "Riktiga lediga jobb som hänger ihop med dina anteckningar tänds medan du pratar, med skälen. Företagen ser dig bara om du går med i gruppen eller söker ett av deras jobb. Du kan söka jobb på evenemanget med en kort jobbintervju, som bedöms mot annonsens krav.",

  gainTitle: "Vad företag och arrangörer får",
  companiesTitle: "Företag",
  companiesBody:
    "Varje morgon en kort lista med personer det är värt att prata med, med skälen, under neutrala smeknamn och i ingen särskild ordning. Ett skall-krav i en annons tar aldrig bort någon ur gruppen. De som söker med en jobbintervju visas i en rangordnad lista som en arrangör har kontrollerat och godkänt.",
  organisersTitle: "Arrangörer i Esbo",
  organisersBody:
    "Varje förslag förbereds för granskning och godkänns en person i taget innan ett företag ser det. Varje beslut sparas i loggen, och namnen förblir dolda tills båda sidor har sagt ja.",

  notTitle: "Vad AI:n inte gör",
  not1Title: "Den antecknar. Den poängsätter inte samtalet.",
  not1Body: "Ditt samtal och ditt kort får inga poäng, nivåer eller procent, och inga kommentarer om hur du pratar eller mår. Bara en jobbintervju som du själv väljer bedöms, och det får du veta först.",
  not2Title: "Den bestämmer inte vem som föreslås.",
  not2Body: "En människa godkänner varje förslag. En person i taget. Ingen godkänn alla.",
  not3Title: "Den kan inte hitta på dina ord.",
  not3Body: "Dina meningar visas exakt som de skrevs ut. AI:ns formulering visas separat och med etikett.",
  nothingScored: "Ditt samtal poängsätts inte.",
  how: "Så fungerar det här",
  prototype: "Hackathonprototyp, inte en officiell tjänst från Esbo stad.",
};

export const frontMessages = { en, fi, sv } satisfies Messages<Strings>;
export type FrontStrings = Strings;
