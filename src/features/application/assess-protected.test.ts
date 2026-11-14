import { describe, expect, it } from "vitest";
import { HIDDEN_WORD, LEFT_OUT_SENTENCE, findProtectedWritten, screenAnswerSentence } from "./assess-protected";

describe("screenAnswerSentence: what a person says about themselves is left out", () => {
  it.each([
    "Olen 52-vuotias ja minulla on kolme lasta.",
    "Olen kotoisin Syyriasta ja olen muslimi.",
    "Jag är 52 år och har tre barn.",
    "Jag kommer från Irak.",
    "I am 52 and a mother of three.",
    "I am a Muslim woman.",
    "I have diabetes so I took a year off.",
    "I was on sick leave after my burnout.",
    "I am a native Arabic speaker.",
    "I am Russian and moved here in 2019.",
    "Olen virolainen.",
    "My mother tongue is Somali.",
    "Before my daughter was born I ran the night shift.",
    "As an immigrant I had to start from the bottom.",
    "Äidinkieleni on venäjä.",
    "Jag var föräldraledig i ett år.",
  ])("leaves out: %s", (sentence) => {
    expect(screenAnswerSentence(sentence)).toEqual({ text: LEFT_OUT_SENTENCE, leftOut: true });
  });
});

describe("screenAnswerSentence: work evidence stays", () => {
  it.each([
    "I rebuilt the nightly import.",
    "I worked with children in a daycare.",
    "I guided patients with diabetes by phone every morning.",
    "On the ward I assessed illnesses and wrote the diagnoses into the system.",
    "I wired male and female connectors on the test bench.",
    "I use Finnish with customers every day.",
    "The release notes were in English and I wrote them.",
    "I am a Finnish teacher at an adult education centre.",
    "Olen vastannut tuontien rakentamisesta.",
    "Hoidin lasten iltapäiväkerhoa kolme vuotta.",
    "Jag har byggt importen själv.",
    "Jag arbetade med äldre patienter på en vårdcentral.",
    "I trained four new drivers on the reach truck.",
    "Puhun työssäni venäjää ja viroa asiakkaiden kanssa.",
    "Hoidin oman vuoroni ja tämän asian loppuun.",
    "Jag talar ryska och tyska med kunderna.",
  ])("keeps as it is: %s", (sentence) => {
    expect(screenAnswerSentence(sentence)).toEqual({ text: sentence, leftOut: false });
  });

  it("keeps a sentence that names a country and hides the word", () => {
    expect(screenAnswerSentence("I worked at a factory in Germany for six years.")).toEqual({
      text: `I worked at a factory in ${HIDDEN_WORD} for six years.`,
      leftOut: false,
    });
    expect(screenAnswerSentence("Työskentelin tehtaassa Saksassa kuusi vuotta.").text).toBe(`Työskentelin tehtaassa ${HIDDEN_WORD} kuusi vuotta.`);
    expect(screenAnswerSentence("Jag körde truck på ett lager i Tyskland.").text).toBe(`Jag körde truck på ett lager i ${HIDDEN_WORD}.`);
    expect(screenAnswerSentence("Our Syrian and Iraqi customers called me directly.").text).toBe(`Our ${HIDDEN_WORD} and ${HIDDEN_WORD} customers called me directly.`);
    expect(screenAnswerSentence("I am an Indian chef with ten years in hotel kitchens.").text).toBe(`I am an ${HIDDEN_WORD} chef with ten years in hotel kitchens.`);
    expect(screenAnswerSentence("Palvelin venäläisiä asiakkaita Venäjän rajalla.").text).toBe(`Palvelin ${HIDDEN_WORD} asiakkaita ${HIDDEN_WORD} rajalla.`);
  });

  it("does not hide the name of a language, in any of the three languages", () => {
    for (const sentence of ["I translated the manuals from German to English.", "Käytän työssäni suomea ja englantia.", "Jag talar svenska och finska med kunderna."]) {
      expect(screenAnswerSentence(sentence).text).toBe(sentence);
    }
  });
});

describe("findProtectedWritten: a reason must not say anything protected about the person", () => {
  it.each([
    "The answer mentions being 52 years of age.",
    "The person is a 45-year-old with a long career.",
    "The answer mentions having diabetes and documenting every shift.",
    "The answer mentions that the person has three children.",
    "The answer describes returning from sick leave.",
    "The answer describes work done as an immigrant.",
    "The answer mentions being a Muslim.",
    "The answer says the person is a native speaker.",
    "The answer describes a woman leading the shift.",
    "The answer describes six years at a factory in Germany.",
    "Kolmen lapsen äiti kuvaa tuontia.",
    "Vastauksessa mainitaan kolme lasta.",
    "Vastaus kertoo, että henkilö on 52-vuotias.",
    "Vastauksessa kerrotaan sairauslomasta.",
    "Svaret nämner tre barn och diabetes.",
    "Svaret säger att personen har diabetes.",
    "Svaret beskriver en 52-årig person.",
  ])("finds something in: %s", (text) => {
    expect(findProtectedWritten(text).length).toBeGreaterThan(0);
  });

  it.each([
    "The answer describes rebuilding a nightly import and the stock counts matching afterwards.",
    "The answer describes guiding patients with diabetes by phone every morning.",
    "The answer describes planning a week of activities for a group of children.",
    "The answer describes using Finnish with customers every day.",
    "The answer describes writing release notes in English.",
    "The answer describes training four new drivers on a reach truck in narrow aisles.",
    "The answers say this is familiar, without an example from the person's own work.",
    "Vastaus kuvaa lasten iltapäiväkerhon ohjaamista kolmen vuoden ajan.",
    "Vastaus kuvaa diabetesta sairastavien potilaiden ohjausta puhelimessa.",
    "Vastauksessa kuvataan suomen käyttöä asiakkaiden kanssa päivittäin.",
    "Svaret beskriver hur man bedömde vårdbehov per telefon varje morgon.",
    "Svaret beskriver arbete med äldre patienter på en vårdcentral.",
  ])("finds nothing in: %s", (text) => {
    expect(findProtectedWritten(text)).toEqual([]);
  });
});
