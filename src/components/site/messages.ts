import type { Messages } from "@/lib/i18n";

// Temporary: replaced by src/lib/i18n/content/core.ts once that lands.
export const siteMessages = {
  en: {
    navInterview: "Interview",
    navCard: "My card",
    navMatches: "My matches",
    navOrganisers: "For organisers",
    navHow: "How this works",
    footer: "Prototype for Junction 2026. Not an official City of Espoo service.",
    tagline:
      "A short conversation becomes a Signal Card that helps people in Espoo find work that fits.",
    startInterview: "Start the interview",
    devHeading: "Dev test pages",
    navLabel: "Main",
    language: "Language",
  },
  fi: {
    navInterview: "Haastattelu",
    navCard: "Korttini",
    navMatches: "Osumani",
    navOrganisers: "Järjestäjille",
    navHow: "Näin tämä toimii",
    footer: "Prototyyppi Junction 2026 -tapahtumaan. Ei ole Espoon kaupungin virallinen palvelu.",
    tagline:
      "Lyhyestä keskustelusta syntyy Signaalikortti, joka auttaa espoolaisia löytämään itselleen sopivaa työtä.",
    startInterview: "Aloita haastattelu",
    devHeading: "Kehittäjien testisivut",
    navLabel: "Päävalikko",
    language: "Kieli",
  },
  sv: {
    navInterview: "Intervju",
    navCard: "Mitt kort",
    navMatches: "Mina matchningar",
    navOrganisers: "För arrangörer",
    navHow: "Så fungerar det",
    footer: "Prototyp för Junction 2026. Inte en officiell tjänst från Esbo stad.",
    tagline:
      "Ett kort samtal blir ett Signalkort som hjälper människor i Esbo att hitta arbete som passar.",
    startInterview: "Starta intervjun",
    devHeading: "Testsidor för utvecklare",
    navLabel: "Huvudmeny",
    language: "Språk",
  },
} satisfies Messages<{
  navInterview: string;
  navCard: string;
  navMatches: string;
  navOrganisers: string;
  navHow: string;
  footer: string;
  tagline: string;
  startInterview: string;
  devHeading: string;
  navLabel: string;
  language: string;
}>;
