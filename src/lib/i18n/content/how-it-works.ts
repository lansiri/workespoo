/**
 * The public "How this works" page, from docs/specs/responsible-ai.md section 7, with one
 * added section that states the EU AI Act timing as cautiously as section 5 of that spec does.
 * Placeholders: `{voice}` (the sentence about the speech service in use) and `{model}` (the model
 * line). Every sentence is true of the product as built (docs/LEAD-DECISIONS.md, 14 Nov 01:30), and
 * the job interview section follows the owner's decision of 14 Nov 12:50 and docs/specs/job-interview.md.
 * It sits at index 8, after "Limits we know about", so the earlier sections keep their places.
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
        heading: "In the conversation, the AI takes notes. It does not judge.",
        body: "In this conversation it does not score you, rate your answers, guess your level or comment on how you speak or feel. It does not ask about your age, gender, background, nationality, religion, health, family, residence permit or native language. If you mention any of these, it is not written down on your card. Only a job interview you choose to take later is rated, and you are told before it starts.",
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
        body: 'Companies see your card under a nickname such as "Birch-27", with a short, neutral English description of each note written by AI and approved by you. They do not see your name, your own words, which language you spoke or whether you spoke or typed. If a company asks to meet you and you agree, they see your name and your own words. If you apply for a job at a company, that company also sees your place, points, levels and reasons on the list an organiser approved.',
      },
      {
        heading: "People decide about introductions",
        body: "You choose whether to join the pool of people companies can be suggested. An Espoo organiser reviews every suggestion one by one before a company sees it. Requirements in a job ad never filter anyone out automatically.",
      },
      {
        heading: "Your data",
        body: "We do not store audio. {voice} Your text is processed by {model}. A CV, if you paste one, is only used to choose up to two questions and is not kept. Live demo sessions are deleted after 24 hours. You can download your data or delete it at any time, job applications and their ratings included.",
      },
      {
        heading: "Limits we know about",
        body: "Speech recognition is less accurate for some accents. AI models can miss things or describe them differently for different people; that is why you review everything. Some skills have no match in the European ESCO skills list; they stay on your card anyway.",
      },
      {
        heading: "Applying for a job: the one thing that is rated",
        body: "Once your card is approved, you can choose a job of the event and take a job interview with questions from its ad. You are told beforehand that your answers will be rated and the applicants put in order, and nothing starts until you say yes. Everyone who applies to the job in the same language gets the same questions; only a follow-up question can differ. When you send your application, an AI rates the evidence in your answers for each requirement on four levels (No evidence, Stated, Example, Example close to this job) and writes a reason that points to your own sentences. Code, not the AI, then works out the order: points from the levels, with a must-have counting twice as much as a nice-to-have, then the number of must-haves with a concrete example, then who sent first. The AI is never given your name, your nickname or whether you spoke or typed. It is not told which language you chose, though it reads your answers in the language you gave them, and it is told that the language is not evidence. A sentence in which you mention your age, origin, first language, religion, family, gender or health is left out of what it reads. An organiser is shown the answers behind every rating, can move a person with a written reason, and must approve the list before the company sees anything. The company sees your nickname, your place, your points, the levels and the reasons, and whether an organiser moved you, but not your name or your own words unless you both agree to meet. A rating never removes anyone from the list. You see your own levels and reasons, and your place once the list is approved. You can withdraw, which deletes your answers and ratings and takes you off the list; the audit log keeps a record of the steps, such as that you applied and withdrew, but not your answers or ratings. The checks that keep personal details from the AI are word lists and can miss an unusual way of saying something. That is why an organiser checks every list before a company sees it.",
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
    credit:
      "Skills taxonomy: ESCO, European Commission. Speech recognition: Parakeet TDT 0.6b v3 by NVIDIA (CC BY 4.0), run with sherpa-onnx. The interviewer's voice: Piper.",
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
        heading: "Keskustelussa tekoäly tekee muistiinpanoja. Se ei arvioi sinua.",
        body: "Tässä keskustelussa se ei pisteytä sinua, arvioi vastauksiasi, arvaa osaamisesi tasoa eikä kommentoi sitä, miten puhut tai miltä sinusta tuntuu. Se ei kysy ikääsi, sukupuoltasi, taustaasi, kansalaisuuttasi, uskontoasi, terveyttäsi, perhettäsi, oleskelulupaasi tai äidinkieltäsi. Jos mainitset jonkin näistä, sitä ei kirjata korttiisi. Vain työhaastattelu, jonka valitset myöhemmin itse, arvioidaan, ja siitä kerrotaan ennen kuin se alkaa.",
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
        body: "Yritykset näkevät korttisi nimimerkillä, kuten ”Birch-27”. Jokaisesta muistiinpanosta näytetään lyhyt, neutraali englanninkielinen kuvaus, jonka tekoäly on kirjoittanut ja sinä hyväksynyt. Yritykset eivät näe nimeäsi, omia sanojasi, sitä millä kielellä puhuit, eivätkä sitä, puhuitko vai kirjoititko. Jos yritys pyytää tapaamista ja suostut siihen, se näkee nimesi ja omat sanasi. Jos haet yrityksen työpaikkaa, se näkee myös sijasi, pisteesi, tasosi ja perustelut järjestäjän hyväksymällä listalla.",
      },
      {
        heading: "Ihmiset päättävät esittelyistä",
        body: "Sinä valitset, haluatko mukaan niiden joukkoon, joita voidaan ehdottaa yrityksille. Espoon järjestäjä käy jokaisen ehdotuksen läpi yksitellen ennen kuin yritys näkee sen. Työpaikkailmoituksen vaatimukset eivät koskaan karsi ketään automaattisesti.",
      },
      {
        heading: "Tietosi",
        body: "Emme tallenna ääntä. {voice} Tekstiäsi käsittelee {model}. Jos liität mukaan CV:n, sitä käytetään vain enintään kahden kysymyksen valitsemiseen, eikä sitä säilytetä. Livedemon istunnot poistetaan 24 tunnin kuluttua. Voit ladata tietosi tai poistaa ne milloin tahansa, myös työhakemukset ja niiden arviot.",
      },
      {
        heading: "Rajoitukset, jotka tiedämme",
        body: "Puheentunnistus toimii joillakin aksenteilla huonommin. Tekoälymallit voivat jättää asioita huomaamatta tai kuvata niitä eri ihmisille eri tavoin. Siksi tarkistat kaiken itse. Kaikille taidoille ei löydy vastinetta eurooppalaisesta ESCO-luokituksesta. Ne pysyvät silti kortillasi.",
      },
      {
        heading: "Työn hakeminen: ainoa asia, jota arvioidaan",
        body: "Kun korttisi on hyväksytty, voit valita tapahtuman työpaikan ja käydä työhaastattelun, jonka kysymykset tulevat sen ilmoituksesta. Sinulle kerrotaan etukäteen, että vastauksesi arvioidaan ja hakijat asetetaan järjestykseen, eikä mitään aloiteta ennen kuin vastaat kyllä. Kaikilta samalla kielellä työpaikkaa hakevilta kysytään samat kysymykset. Vain tarkentava lisäkysymys voi olla eri. Kun lähetät hakemuksen, tekoäly arvioi jokaisen vaatimuksen kohdalla vastaustesi näytön neljällä tasolla (Ei näyttöä, Mainittu, Esimerkki, Esimerkki tätä työtä vastaavasta) ja kirjoittaa perustelun, joka viittaa omiin lauseisiisi. Järjestyksen laskee sen jälkeen ohjelma, ei tekoäly: ensin tasoista tulevat pisteet, joissa pakollinen vaatimus painaa kaksi kertaa niin paljon kuin eduksi luettava, sitten se, monessako pakollisessa vaatimuksessa on konkreettinen esimerkki, ja lopuksi se, kuka lähetti ensin. Tekoäly ei koskaan saa nimeäsi, nimimerkkiäsi eikä tietoa siitä, puhuitko vai kirjoititko. Sille ei kerrota, minkä kielen valitsit, mutta se lukee vastauksesi sillä kielellä, jolla annoit ne, ja sitä ohjeistetaan, ettei kieli ole näyttöä. Lause, jossa kerrot iästäsi, alkuperästäsi, äidinkielestäsi, uskonnostasi, perheestäsi, sukupuolestasi tai terveydestäsi, jätetään pois siitä, mitä se lukee. Espoon järjestäjä näkee jokaisen arvion taustalla olevat vastaukset, voi siirtää hakijaa kirjallisella perustelulla ja hyväksyy listan ennen kuin yritys näkee mitään. Yritys näkee nimimerkkisi, sijasi, pisteesi, tasot ja perustelut sekä sen, siirsikö järjestäjä sinua, mutta ei nimeäsi eikä omia sanojasi, ellette molemmat sovi tapaamisesta. Arvio ei koskaan poista ketään listalta. Näet omat tasosi ja perustelusi sekä listan hyväksymisen jälkeen sijasi. Voit perua hakemuksen, jolloin vastauksesi ja arviosi poistetaan ja sinut poistetaan listalta. Lokiin jää merkintä vaiheista, kuten siitä, että hait ja peruit hakemuksen, mutta ei vastauksiasi eikä arvioitasi. Tarkistukset, jotka pitävät henkilökohtaiset tiedot poissa tekoälyltä, ovat sanalistoja, ja epätavallinen sanamuoto voi mennä niistä läpi. Siksi järjestäjä tarkistaa jokaisen listan ennen kuin yritys näkee sen.",
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
    credit:
      "Osaamisluokitus: ESCO, Euroopan komissio. Puheentunnistus: NVIDIAn Parakeet TDT 0.6b v3 (CC BY 4.0), ajossa sherpa-onnx-ohjelmistolla. Haastattelijan ääni: Piper.",
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
        heading: "I samtalet antecknar AI:n. Den bedömer inte.",
        body: "I det här samtalet poängsätter den dig inte, betygsätter inte dina svar, gissar inte hur kunnig du är och kommenterar inte hur du pratar eller mår. Den frågar inte om din ålder, ditt kön, din bakgrund, nationalitet, religion, hälsa, familj, ditt uppehållstillstånd eller ditt modersmål. Om du nämner något av detta skrivs det inte upp på ditt kort. Bara en jobbintervju som du själv väljer att göra senare bedöms, och det får du veta innan den börjar.",
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
        body: "Företagen ser ditt kort under ett alias, till exempel ”Birch-27”, med en kort och neutral beskrivning på engelska av varje anteckning, skriven av AI och godkänd av dig. De ser inte ditt namn, dina egna ord, vilket språk du talade eller om du pratade eller skrev. Om ett företag vill träffa dig och du går med på det, ser de ditt namn och dina egna ord. Om du söker ett av ett företags jobb ser företaget också din plats, dina poäng, nivåer och skäl på listan som en arrangör har godkänt.",
      },
      {
        heading: "Människor bestämmer om kontakter",
        body: "Du väljer själv om du vill vara med bland dem som kan föreslås för företag. En arrangör från Esbo går igenom varje förslag ett i taget innan ett företag ser det. Kraven i en jobbannons sållar aldrig bort någon automatiskt.",
      },
      {
        heading: "Dina uppgifter",
        body: "Vi sparar inte ljud. {voice} Din text behandlas av {model}. Om du klistrar in ett CV används det bara för att välja högst två frågor, och det sparas inte. Sessioner i livedemon raderas efter 24 timmar. Du kan ladda ner dina uppgifter eller radera dem när som helst, även jobbansökningar och deras bedömningar.",
      },
      {
        heading: "Begränsningar vi känner till",
        body: "Taligenkänningen fungerar sämre med vissa brytningar. AI-modeller kan missa saker eller beskriva dem olika för olika personer. Därför går du själv igenom allt. Vissa färdigheter saknar motsvarighet i den europeiska ESCO-klassificeringen. De står ändå kvar på ditt kort.",
      },
      {
        heading: "Att söka ett jobb: det enda som bedöms",
        body: "När ditt kort är godkänt kan du välja ett av jobben på evenemanget och göra en jobbintervju med frågor från dess annons. Du får veta i förväg att dina svar bedöms och att de sökande ordnas, och ingenting börjar förrän du säger ja. Alla som söker jobbet på samma språk får samma frågor. Bara en följdfråga kan skilja sig. När du skickar din ansökan bedömer en AI underlaget i dina svar för varje krav på fyra nivåer (Inget underlag, Nämnt, Exempel, Exempel nära det här jobbet) och skriver ett skäl som hänvisar till dina egna meningar. Sedan räknar programmet, inte AI:n, ut ordningen: först poäng från nivåerna, där ett skall-krav väger dubbelt så mycket som ett meriterande krav, sedan antalet skall-krav med ett konkret exempel och sist vem som skickade först. AI:n får aldrig ditt namn, ditt alias eller om du pratade eller skrev. Den får inte veta vilket språk du valde, men den läser dina svar på det språk du gav dem, och den har fått veta att språket inte är underlag. En mening där du nämner din ålder, ditt ursprung, ditt modersmål, din religion, familj, ditt kön eller din hälsa lämnas utanför det den läser. En arrangör i Esbo ser svaren bakom varje bedömning, kan flytta en person med ett skriftligt skäl och måste godkänna listan innan företaget ser något. Företaget ser ditt alias, din plats, dina poäng, nivåerna och skälen och om en arrangör har flyttat dig, men inte ditt namn eller dina egna ord, om ni inte båda går med på att träffas. En bedömning tar aldrig bort någon från listan. Du ser dina egna nivåer och skäl och, när listan är godkänd, din plats. Du kan dra tillbaka ansökan, då raderas dina svar och bedömningar och du tas bort från listan. Loggen sparar en anteckning om stegen, till exempel att du sökte och drog tillbaka ansökan, men inte dina svar eller bedömningar. Kontrollerna som håller personliga uppgifter borta från AI:n är ordlistor och kan missa ett ovanligt sätt att säga något. Därför kontrollerar en arrangör varje lista innan ett företag ser den.",
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
    credit:
      "Klassificering av färdigheter: ESCO, Europeiska kommissionen. Taligenkänning: Parakeet TDT 0.6b v3 från NVIDIA (CC BY 4.0), körs med sherpa-onnx. Intervjuarens röst: Piper.",
  },
};
