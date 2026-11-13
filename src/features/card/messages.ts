import type { Messages } from "@/lib/i18n";

/** Strings the review page needs beyond `cardCopy`, `approvalCopy` and `poolCopy`. */
export const cardMessages = {
  en: {
    waiting: "Your card is being prepared. This page updates by itself.",
    waitingLong: "This is taking longer than usual. You can keep waiting or try again.",
    loadFailed: "We couldn't load your card.",
    saveFailed: "That didn't save. Please try again.",
    signedOut: "Start an interview first, and your card will appear here.",
    notSet: "Not set",
    rolesHelp: "Up to three, separated by commas.",
    languagesHelp: "Up to five, separated by commas.",
    phraseLabel: "A few words about what you can do",
    escoLabel: "ESCO skill",
    removedHeading: "Removed",
    staleError: "Some company descriptions are still being prepared. Try again in a moment.",
    approveFailed: "We couldn't approve your card. Please try again.",
    saved: "Saved.",
    shownAs: "Shown to companies as:",
    notShownYet: "Not shown to companies yet.",
    rewriting: "Your new wording is being rewritten for companies. They see the earlier text until it is ready.",
    myDataTitle: "Your data",
    myDataHelp: "Download everything we have stored about you, or delete it all.",
    exportData: "Download my data",
    deleteData: "Delete my data and card",
    deleteWarning: "This deletes your interview, your card, your choices and your introductions. It cannot be undone.",
    deleteConfirm: "Yes, delete everything",
    deleteCancel: "Keep my data",
    deleteFailed: "We couldn't delete your data. Please try again.",
    seeMatches: "See jobs that fit your card",
    draftNotice: "You have changes that aren't approved yet.",
    noEscoShort: "No ESCO match",
  },
  fi: {
    waiting: "Korttiasi valmistellaan. Sivu päivittyy itsestään.",
    waitingLong: "Tämä kestää tavallista pidempään. Voit odottaa vielä tai yrittää uudelleen.",
    loadFailed: "Korttiasi ei saatu ladattua.",
    saveFailed: "Tallennus ei onnistunut. Yritä uudelleen.",
    signedOut: "Aloita ensin haastattelu, niin korttisi ilmestyy tähän.",
    notSet: "Ei valittu",
    rolesHelp: "Enintään kolme, pilkulla erotettuina.",
    languagesHelp: "Enintään viisi, pilkulla erotettuina.",
    phraseLabel: "Muutama sana siitä, mitä osaat",
    escoLabel: "ESCO-taito",
    removedHeading: "Poistetut",
    staleError: "Joidenkin yritysnäkymän kuvausten valmistelu on vielä kesken. Yritä hetken kuluttua uudelleen.",
    approveFailed: "Korttiasi ei saatu hyväksyttyä. Yritä uudelleen.",
    saved: "Tallennettu.",
    shownAs: "Yrityksille näytetään:",
    notShownYet: "Ei vielä näkyvissä yrityksille.",
    rewriting: "Uutta sanamuotoasi kirjoitetaan yrityksille sopivaksi. Siihen asti ne näkevät aiemman tekstin.",
    myDataTitle: "Tietosi",
    myDataHelp: "Lataa kaikki sinusta tallennettu tai poista ne kaikki.",
    exportData: "Lataa tietoni",
    deleteData: "Poista tietoni ja korttini",
    deleteWarning: "Tämä poistaa haastattelusi, korttisi, valintasi ja esittelysi. Tätä ei voi perua.",
    deleteConfirm: "Kyllä, poista kaikki",
    deleteCancel: "Säilytä tietoni",
    deleteFailed: "Tietojen poistaminen ei onnistunut. Yritä uudelleen.",
    seeMatches: "Katso korttiisi sopivat työpaikat",
    draftNotice: "Sinulla on muutoksia, joita ei ole vielä hyväksytty.",
    noEscoShort: "Ei ESCO-vastinetta",
  },
  sv: {
    waiting: "Ditt kort förbereds. Sidan uppdateras av sig själv.",
    waitingLong: "Det tar längre tid än vanligt. Du kan vänta lite till eller försöka igen.",
    loadFailed: "Vi kunde inte hämta ditt kort.",
    saveFailed: "Det sparades inte. Försök igen.",
    signedOut: "Starta en intervju först, så dyker ditt kort upp här.",
    notSet: "Inte valt",
    rolesHelp: "Högst tre, avskilda med kommatecken.",
    languagesHelp: "Högst fem, avskilda med kommatecken.",
    phraseLabel: "Några ord om vad du kan",
    escoLabel: "ESCO-färdighet",
    removedHeading: "Borttagna",
    staleError: "Några av företagsbeskrivningarna förbereds fortfarande. Försök igen om en stund.",
    approveFailed: "Vi kunde inte godkänna ditt kort. Försök igen.",
    saved: "Sparat.",
    shownAs: "Visas för företag som:",
    notShownYet: "Visas inte för företag än.",
    rewriting: "Din nya formulering skrivs om för företag. Tills den är klar ser de den tidigare texten.",
    myDataTitle: "Dina uppgifter",
    myDataHelp: "Ladda ner allt vi har sparat om dig, eller radera allt.",
    exportData: "Ladda ner mina uppgifter",
    deleteData: "Radera mina uppgifter och mitt kort",
    deleteWarning: "Detta raderar din intervju, ditt kort, dina val och dina presentationer. Det går inte att ångra.",
    deleteConfirm: "Ja, radera allt",
    deleteCancel: "Behåll mina uppgifter",
    deleteFailed: "Vi kunde inte radera dina uppgifter. Försök igen.",
    seeMatches: "Se jobb som passar ditt kort",
    draftNotice: "Du har ändringar som inte är godkända än.",
    noEscoShort: "Ingen ESCO-motsvarighet",
  },
} satisfies Messages<{
  waiting: string;
  waitingLong: string;
  loadFailed: string;
  saveFailed: string;
  signedOut: string;
  notSet: string;
  rolesHelp: string;
  languagesHelp: string;
  phraseLabel: string;
  escoLabel: string;
  removedHeading: string;
  staleError: string;
  approveFailed: string;
  saved: string;
  seeMatches: string;
  myDataTitle: string;
  myDataHelp: string;
  exportData: string;
  deleteData: string;
  deleteWarning: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleteFailed: string;
  shownAs: string;
  notShownYet: string;
  rewriting: string;
  draftNotice: string;
  noEscoShort: string;
}>;
