import { describe, expect, it } from "vitest";
import {
  findBannedEvaluative,
  findProtectedCard,
  findProtectedQuestion,
  findSpeechCue,
  stripQualityWords,
} from "./lexicon";

describe("findBannedEvaluative", () => {
  it("catches praise and remarks on manner of speaking in English and Finnish", () => {
    expect(findBannedEvaluative("That is an impressive project.")).toEqual(["impressive"]);
    expect(findBannedEvaluative("You sound very confident!")).toEqual(["you sound", "confident"]);
    expect(findBannedEvaluative("Hienoa, kuulostat itsevarmalta.")).toEqual([
      "hienoa",
      "kuulostat",
      "itsevarma",
    ]);
  });

  it("matches stems at the start of a word only", () => {
    expect(findBannedEvaluative("Your enthusiasm shows.")).toEqual(["enthusias"]);
    expect(findBannedEvaluative("We set up a multilevel cache.")).toEqual([]);
    expect(findBannedEvaluative("Which tools did you use for that?")).toEqual([]);
  });

  it("does not collide with ordinary work vocabulary", () => {
    // whole-word entries must not match longer words
    expect(findBannedEvaluative("What kind of work are you looking for next?")).toEqual([]);
    expect(findBannedEvaluative("How did you plan activities for the seniors?")).toEqual([]);
    expect(findBannedEvaluative("Mitkä asiat vaikuttavat työhösi eniten?")).toEqual([]);
    expect(findBannedEvaluative("Kerro tasoitustöistä ja hienosäädöstä.")).toEqual([]);
    // while the evaluative uses are still caught
    expect(findBannedEvaluative("As a senior developer you look like a natural.")).toEqual([
      "senior",
      "you look like",
    ]);
    expect(findBannedEvaluative("Vaikuttava ura, hienoa!")).toEqual(["vaikuttava", "hienoa"]);
    expect(findBannedEvaluative("Mikä on tasosi?")).toEqual(["tasosi"]);
  });

  it("catches praise in Swedish", () => {
    expect(findBannedEvaluative("Imponerande, du låter självsäker.")).toEqual([
      "imponera",
      "du låter",
      "självsäker",
    ]);
  });

  it("leaves neutral acknowledgements alone", () => {
    expect(findBannedEvaluative("Thanks, that's clear. What did you do next?")).toEqual([]);
    expect(findBannedEvaluative("Kiitos, tämä selvä. Mitä teit seuraavaksi?")).toEqual([]);
    expect(findBannedEvaluative("Tack, det är tydligt. Vad gjorde du sedan?")).toEqual([]);
  });
});

describe("findProtectedQuestion", () => {
  it("catches protected topics", () => {
    expect(findProtectedQuestion("Where are you from originally?")).toEqual(["where are you from"]);
    expect(findProtectedQuestion("Do you have children?")).toEqual(["children"]);
    expect(findProtectedQuestion("Mikä on äidinkielesi?")).toEqual(["äidinkiel"]);
    expect(findProtectedQuestion("Onko sinulla lapsia tai sairausloma?")).toEqual(["laps", "sairau"]);
    expect(findProtectedQuestion("Kuinka monta lasta sinulla on?")).toEqual(["lasta"]);
    expect(findProtectedQuestion("Mikä on syntymävuotesi?")).toEqual(["syntymävuo"]);
    expect(findProtectedQuestion("Tarvitsetko oleskeluluvan?")).toEqual(["oleskelulu"]);
    // "lasta" is a whole word, so loading cargo is not a protected topic
    expect(findProtectedQuestion("Miten lastaus ja lastaaminen sujui varastolla?")).toEqual([]);
  });

  it("catches protected topics in Swedish without colliding with English", () => {
    expect(findProtectedQuestion("Var kommer du ifrån?")).toEqual(["var kommer du ifrån"]);
    expect(findProtectedQuestion("Har du barn?")).toEqual(["har du barn"]);
    expect(findProtectedQuestion("Hur många barn har du?")).toEqual(["barn har du"]);
    expect(findProtectedQuestion("Var är du född?")).toEqual(["är du född"]);
    expect(findProtectedQuestion("Hur arbetade du med din manager?")).toEqual([]);
    expect(findProtectedQuestion("Vad är ditt modersmål?")).toEqual(["modersmål"]);
    expect(findProtectedQuestion("What did you make in the barn as a gift?")).toEqual([]);
    expect(findProtectedQuestion("Vilka verktyg använde du i det arbetet?")).toEqual([]);
  });

  it("does not match inside unrelated words", () => {
    expect(findProtectedQuestion("Were you stubborn about the design?")).toEqual([]);
    expect(findProtectedQuestion("Tell me about a recent task you handled yourself.")).toEqual([]);
  });
});

describe("findProtectedCard", () => {
  it("catches protected terms, ages, countries and nationalities", () => {
    expect(findProtectedCard("Stock room management in a Nigerian pharmacy")).toEqual(["Nigerian"]);
    expect(findProtectedCard("52 years old warehouse lead")).toContain("52 years old");
    expect(findProtectedCard("Native speaker level customer service")).toEqual(["native speaker"]);
  });

  it("keeps legitimate skill wording", () => {
    expect(findProtectedCard("Health and safety inspections")).toEqual([]);
    expect(findProtectedCard("Healthcare data analysis")).toEqual([]);
    expect(findProtectedCard("Finnish labour law")).toEqual([]);
    expect(findProtectedCard("Nordic market sales")).toEqual([]);
  });

  it("matches countries case-sensitively as whole words", () => {
    expect(findProtectedCard("I polish UI designs before release")).toEqual([]);
    expect(findProtectedCard("Polish market expansion")).toEqual(["Polish"]);
    expect(findProtectedCard("Fine china restoration")).toEqual([]);
  });
});

describe("stripQualityWords", () => {
  it("removes grading words and year counts", () => {
    expect(stripQualityWords("senior Java developer")).toBe("Java developer");
    expect(stripQualityWords("5 years of Python programming")).toBe("Python programming");
    expect(stripQualityWords("Expert project management, 10+ years")).toBe("project management");
    expect(stripQualityWords("strong customer service")).toBe("customer service");
  });

  it("returns an empty string when nothing meaningful is left", () => {
    expect(stripQualityWords("expert")).toBe("");
    expect(stripQualityWords("5 years")).toBe("");
  });

  it("leaves ordinary phrases unchanged", () => {
    expect(stripQualityWords("warehouse stock control")).toBe("warehouse stock control");
  });
});

describe("findSpeechCue", () => {
  it("catches wording about how someone spoke or about the interview", () => {
    expect(findSpeechCue("In the interview they spoke fluently about SAP.")).toEqual([
      "interview",
      "spoke",
      "fluen",
    ]);
    expect(findSpeechCue("They typed that they handle supplier claims.")).toEqual(["typed"]);
  });

  it("leaves ordinary skill wording alone", () => {
    expect(findSpeechCue("They receive goods and check them against orders.")).toEqual([]);
    expect(findSpeechCue("They maintain bespoke reporting tools.")).toEqual([]);
  });
});
