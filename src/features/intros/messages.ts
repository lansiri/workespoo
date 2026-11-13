import type { Messages } from "@/lib/i18n/types";

/** What each side reads about an introduction's state (picks-and-intros.md section 6). */
const introEn = {
  awaitingTalent: "Request sent. Waiting for the person to answer (until {date}).",
  awaitingCompany: "Waiting for the company to answer (until {date}).",
  pendingReview: "Waiting for an organiser.",
  accepted: "You both agreed to meet.",
  declined: "The person chose not to meet this time.",
  withdrawn: "This request was withdrawn.",
  expired: "No answer before {date}. The request has closed.",
  notApproved: "This request was not taken further.",
  cancelled: "This meeting was cancelled.",
};

export const introMessages = {
  en: introEn,
  fi: {
    awaitingTalent: "Pyyntö lähetetty. Odotetaan henkilön vastausta (viimeistään {date}).",
    awaitingCompany: "Odotetaan yrityksen vastausta (viimeistään {date}).",
    pendingReview: "Odotetaan järjestäjää.",
    accepted: "Molemmat suostuitte tapaamiseen.",
    declined: "Henkilö päätti tällä kertaa olla tapaamatta.",
    withdrawn: "Pyyntö peruttiin.",
    expired: "Vastausta ei tullut ennen {date}. Pyyntö on sulkeutunut.",
    notApproved: "Pyyntöä ei viety eteenpäin.",
    cancelled: "Tämä tapaaminen peruttiin.",
  },
  sv: {
    awaitingTalent: "Förfrågan skickad. Väntar på personens svar (senast {date}).",
    awaitingCompany: "Väntar på företagets svar (senast {date}).",
    pendingReview: "Väntar på en arrangör.",
    accepted: "Ni kom överens om att ses.",
    declined: "Personen valde att inte träffas den här gången.",
    withdrawn: "Förfrågan drogs tillbaka.",
    expired: "Inget svar före {date}. Förfrågan har stängts.",
    notApproved: "Förfrågan fördes inte vidare.",
    cancelled: "Det här mötet ställdes in.",
  },
} satisfies Messages<typeof introEn>;
