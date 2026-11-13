import type { Messages } from "@/lib/i18n/types";

const devEn = {
  title: "Picks and introductions: test page",
  organiser: "Organiser",
  signedOut: "Sign in as an organiser to see the company links.",
  companies: "Companies and their links",
  none: "No participating companies yet.",
  open: "Open",
  review: "Review queue",
  overview: "Overview",
};

export const devMessages = {
  en: devEn,
  fi: {
    title: "Ehdotukset ja esittelyt: testisivu",
    organiser: "Järjestäjä",
    signedOut: "Kirjaudu järjestäjänä nähdäksesi yritysten linkit.",
    companies: "Yritykset ja niiden linkit",
    none: "Ei vielä mukana olevia yrityksiä.",
    open: "Avaa",
    review: "Tarkistusjono",
    overview: "Tilanne",
  },
  sv: {
    title: "Förslag och introduktioner: testsida",
    organiser: "Arrangör",
    signedOut: "Logga in som arrangör för att se företagens länkar.",
    companies: "Företag och deras länkar",
    none: "Inga deltagande företag ännu.",
    open: "Öppna",
    review: "Granskningskö",
    overview: "Läget",
  },
} satisfies Messages<typeof devEn>;
