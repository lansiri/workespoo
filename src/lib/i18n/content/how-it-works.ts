/**
 * The public "How this works" page, from docs/specs/responsible-ai.md section 7, with one
 * added section that states the EU AI Act timing as cautiously as section 5 of that spec does.
 * Placeholders: `{voice}` (the sentence about the speech service in use) and `{model}` (the model
 * line). Every sentence is true of the product as built (docs/LEAD-DECISIONS.md, 14 Nov 01:30).
 */
import type { UiLang } from "@/contracts";

export interface HowItWorksSection {
  heading: string;
  body: string;
}

export interface HowItWorksContent {
  title: string;
  intro: string;
  sections: HowItWorksSection[];
  /** Attribution line at the end of the page. */
  credit: string;
}

export const howItWorks: Record<UiLang, HowItWorksContent> = {
  en: {
    title: "How WorkEspoo works",
    intro:
      'WorkEspoo is a hackathon prototype made for Junction 2026 and the City of Espoo challenge "Rethinking Recruitment". It is not an official City of Espoo service. People shown in the demo are synthetic unless they took part live and agreed to it.',
    sections: [
      {
        heading: "A short conversation instead of a CV",
        body: "You talk or type with an AI interviewer. It asks a few short questions about your work: what you do, one example, the tools you use, who you work with, and what you are looking for. It tells you at the start that it is an AI.",
      },
      {
        heading: "The AI takes notes. It does not judge.",
        body: "It does not score you, rate your answers, guess your level or comment on how you speak or feel. It does not ask about your age, gender, background, nationality, religion, health, family, residence permit or native language. If you mention any of these, it is not written down on your card.",
      },
      {
        heading: "Your words are the evidence",
        body: "Each note on your Signal Card points to sentences you said. The computer shows your sentences exactly as they were transcribed; the AI cannot invent a quote. Speech recognition makes mistakes, especially with accents, so you can type instead of speaking, and during the conversation you can remove any answer.",
      },
      {
        heading: "You decide",
        body: "You can change or remove any note, and approve the card only when you are happy with it. Nothing is used before you approve it.",
      },
      {
        heading: "What companies see",
        body: 'Companies see your card under a nickname such as "Birch-27", with a short, neutral English description of each note written by AI and approved by you. They do not see your name, your own words, which language you spoke or whether you spoke or typed. If a company asks to meet you and you agree, they see your name and your own words.',
      },
      {
        heading: "People decide about introductions",
        body: "You choose whether to join the pool of people companies can be suggested. An Espoo organiser reviews every suggestion one by one before a company sees it. Requirements in a job ad never filter anyone out automatically.",
      },
      {
        heading: "Your data",
        body: "We do not store audio. {voice} Your text is processed by {model}. A CV, if you paste one, is only used to choose up to two questions and is not kept. Live demo sessions are deleted after 24 hours. You can download your data or delete it at any time.",
      },
      {
        heading: "Limits we know about",
        body: "Speech recognition is less accurate for some accents. AI models can miss things or describe them differently for different people; that is why you review everything. Some skills have no match in the European ESCO skills list; they stay on your card anyway.",
      },
      {
        heading: "The EU AI Act",
        body: "AI used in recruitment counts as high-risk under the EU AI Act. Its bans, including on emotion recognition at work, have applied since 2 February 2025. The rules for high-risk systems were originally due on 2 August 2026; secondary sources say a 2026 amendment moved them to 2 December 2027. We have not checked this against the Official Journal, so we have built WorkEspoo as if those rules already apply. This is the team's own reading, not legal advice.",
      },
      {
        heading: "Questions",
        body: "Ask the organisers at the event.",
      },
    ],
    credit: "Skills taxonomy: ESCO, European Commission.",
  },
  fi: {
    title: "Näin WorkEspoo toimii",
    intro:
      "WorkEspoo on hackathon-prototyyppi, joka on tehty Junction 2026 -tapahtumaan ja Espoon kaupungin haasteeseen ”Rethinking Recruitment”. Se ei ole Espoon kaupungin virallinen palvelu. Demossa näkyvät henkilöt ovat keksittyjä, ellei joku ole osallistunut itse paikan päällä ja antanut siihen luvan.",
    sections: [
      {
        heading: "Lyhyt keskustelu CV:n sijaan",
        body: "Puhut tai kirjoitat tekoälyhaastattelijan kanssa. Se kysyy muutaman lyhyen kysymyksen työstäsi: mitä teet, yhden esimerkin, mitä työkaluja käytät, kenen kanssa työskentelet ja millaista työtä etsit. Se kertoo heti alussa olevansa tekoäly.",
      },
      {
        heading: "Tekoäly tekee muistiinpanoja. Se ei arvioi sinua.",
        body: "Se ei pisteytä sinua, arvioi vastauksiasi, arvaa osaamisesi tasoa eikä kommentoi sitä, miten puhut tai miltä sinusta tuntuu. Se ei kysy ikääsi, sukupuoltasi, taustaasi, kansalaisuuttasi, uskontoasi, terveyttäsi, perhettäsi, oleskelulupaasi tai äidinkieltäsi. Jos mainitset jonkin näistä, sitä ei kirjata korttiisi.",
      },
      {
        heading: "Omat sanasi ovat näyttö",
        body: "Jokainen Signaalikorttisi muistiinpano viittaa lauseisiin, jotka sanoit. Lauseesi näytetään täsmälleen niin kuin ne litteroitiin, eikä tekoäly voi keksiä lainausta. Puheentunnistus tekee virheitä, varsinkin aksenttien kanssa, joten voit kirjoittaa puhumisen sijaan, ja keskustelun aikana voit poistaa minkä tahansa vastauksen.",
      },
      {
        heading: "Sinä päätät",
        body: "Voit muuttaa tai poistaa minkä tahansa muistiinpanon. Hyväksyt kortin vasta, kun olet siihen tyytyväinen. Mitään ei käytetä ennen kuin hyväksyt sen.",
      },
      {
        heading: "Mitä yritykset näkevät",
        body: "Yritykset näkevät korttisi nimimerkillä, kuten ”Birch-27”. Jokaisesta muistiinpanosta näytetään lyhyt, neutraali englanninkielinen kuvaus, jonka tekoäly on kirjoittanut ja sinä hyväksynyt. Yritykset eivät näe nimeäsi, omia sanojasi, sitä millä kielellä puhuit, eivätkä sitä, puhuitko vai kirjoititko. Jos yritys pyytää tapaamista ja suostut siihen, se näkee nimesi ja omat sanasi.",
      },
      {
        heading: "Ihmiset päättävät esittelyistä",
        body: "Sinä valitset, haluatko mukaan niiden joukkoon, joita voidaan ehdottaa yrityksille. Espoon järjestäjä käy jokaisen ehdotuksen läpi yksitellen ennen kuin yritys näkee sen. Työpaikkailmoituksen vaatimukset eivät koskaan karsi ketään automaattisesti.",
      },
      {
        heading: "Tietosi",
        body: "Emme tallenna ääntä. {voice} Tekstiäsi käsittelee {model}. Jos liität mukaan CV:n, sitä käytetään vain enintään kahden kysymyksen valitsemiseen, eikä sitä säilytetä. Livedemon istunnot poistetaan 24 tunnin kuluttua. Voit ladata tietosi tai poistaa ne milloin tahansa.",
      },
      {
        heading: "Rajoitukset, jotka tiedämme",
        body: "Puheentunnistus toimii joillakin aksenteilla huonommin. Tekoälymallit voivat jättää asioita huomaamatta tai kuvata niitä eri ihmisille eri tavoin. Siksi tarkistat kaiken itse. Kaikille taidoille ei löydy vastinetta eurooppalaisesta ESCO-luokituksesta. Ne pysyvät silti kortillasi.",
      },
      {
        heading: "EU:n tekoälysäädös",
        body: "Rekrytoinnissa käytettävä tekoäly on EU:n tekoälysäädöksessä suuririskistä. Säädöksen kiellot, myös tunteiden tunnistaminen työpaikalla, ovat olleet voimassa 2. helmikuuta 2025 alkaen. Suuririskisiä järjestelmiä koskevien velvoitteiden piti alun perin tulla voimaan 2. elokuuta 2026. Toissijaisten lähteiden mukaan vuoden 2026 muutos siirsi ne 2. joulukuuta 2027. Emme ole tarkistaneet tätä EU:n virallisesta lehdestä, joten olemme rakentaneet WorkEspoon niin kuin velvoitteet olisivat jo voimassa. Tämä on tiimin oma tulkinta, ei oikeudellinen neuvo.",
      },
      {
        heading: "Kysymyksiä",
        body: "Kysy tapahtuman järjestäjiltä.",
      },
    ],
    credit: "Osaamisluokitus: ESCO, Euroopan komissio.",
  },
  sv: {
    title: "Så fungerar WorkEspoo",
    intro:
      "WorkEspoo är en prototyp som byggts under hackathonet Junction 2026 för Esbo stads utmaning ”Rethinking Recruitment”. Det är inte en officiell tjänst från Esbo stad. Personerna i demon är påhittade, utom de som själva deltog på plats och gick med på det.",
    sections: [
      {
        heading: "Ett kort samtal i stället för ett CV",
        body: "Du pratar eller skriver med en AI-intervjuare. Den ställer några korta frågor om ditt arbete: vad du gör, ett exempel, vilka verktyg du använder, vem du arbetar med och vad du söker. Den säger redan i början att den är en AI.",
      },
      {
        heading: "AI:n antecknar. Den bedömer inte.",
        body: "Den poängsätter dig inte, betygsätter inte dina svar, gissar inte hur kunnig du är och kommenterar inte hur du pratar eller mår. Den frågar inte om din ålder, ditt kön, din bakgrund, nationalitet, religion, hälsa, familj, ditt uppehållstillstånd eller ditt modersmål. Om du nämner något av detta skrivs det inte upp på ditt kort.",
      },
      {
        heading: "Dina egna ord är grunden",
        body: "Varje anteckning på ditt Signalkort hänvisar till meningar som du sa. Dina meningar visas exakt som de skrevs ut, och AI:n kan inte hitta på ett citat. Taligenkänningen gör misstag, särskilt när man har brytning, så du kan skriva i stället för att tala, och under samtalet kan du ta bort vilket svar som helst.",
      },
      {
        heading: "Du bestämmer",
        body: "Du kan ändra eller ta bort vilken anteckning som helst. Du godkänner kortet först när du är nöjd med det. Ingenting används innan du har godkänt det.",
      },
      {
        heading: "Vad företagen ser",
        body: "Företagen ser ditt kort under ett alias, till exempel ”Birch-27”, med en kort och neutral beskrivning på engelska av varje anteckning, skriven av AI och godkänd av dig. De ser inte ditt namn, dina egna ord, vilket språk du talade eller om du pratade eller skrev. Om ett företag vill träffa dig och du går med på det, ser de ditt namn och dina egna ord.",
      },
      {
        heading: "Människor bestämmer om kontakter",
        body: "Du väljer själv om du vill vara med bland dem som kan föreslås för företag. En arrangör från Esbo går igenom varje förslag ett i taget innan ett företag ser det. Kraven i en jobbannons sållar aldrig bort någon automatiskt.",
      },
      {
        heading: "Dina uppgifter",
        body: "Vi sparar inte ljud. {voice} Din text behandlas av {model}. Om du klistrar in ett CV används det bara för att välja högst två frågor, och det sparas inte. Sessioner i livedemon raderas efter 24 timmar. Du kan ladda ner dina uppgifter eller radera dem när som helst.",
      },
      {
        heading: "Begränsningar vi känner till",
        body: "Taligenkänningen fungerar sämre med vissa brytningar. AI-modeller kan missa saker eller beskriva dem olika för olika personer. Därför går du själv igenom allt. Vissa färdigheter saknar motsvarighet i den europeiska ESCO-klassificeringen. De står ändå kvar på ditt kort.",
      },
      {
        heading: "EU:s AI-förordning",
        body: "AI som används vid rekrytering räknas som hög risk enligt EU:s AI-förordning. Förordningens förbud, bland annat mot känsloigenkänning på arbetsplatsen, har gällt sedan den 2 februari 2025. Kraven på system med hög risk skulle från början börja gälla den 2 augusti 2026. Enligt andrahandskällor flyttade en ändring från 2026 dem till den 2 december 2027. Vi har inte kontrollerat detta mot EU:s officiella tidning, så vi har byggt WorkEspoo som om kraven redan gäller. Det här är teamets egen tolkning, inte juridisk rådgivning.",
      },
      {
        heading: "Frågor",
        body: "Fråga arrangörerna på plats.",
      },
    ],
    credit: "Klassificering av färdigheter: ESCO, Europeiska kommissionen.",
  },
};
