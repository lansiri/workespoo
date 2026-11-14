# Voice on our own server, part D: what the person is told

Since 14 November the person's speech is turned into text on WorkEspoo's own server (`docs/research/voice-stt.md`) instead of by the browser's speech service. `GET /api/voice/config` then answers `{ adapter: "server", processor: "WorkEspoo's own server", ... }`. The consent text and the public page must say what is now true, in three languages. When the config still says `browser` or `elevenlabs`, today's texts stay.

Paths: `src/lib/i18n/content/copy.ts`, `src/lib/i18n/content/how-it-works.ts`, `src/lib/i18n/content/content.test.ts`, `src/lib/consent.ts` (the version constant only) and tests that name the version, `src/features/interview/ConsentForm.tsx`, `src/features/interview/messages.ts`, `src/features/interview/pages.test.ts`, `src/app/(public)/how-it-works/**`, `docs/specs/copy.md` if it lists these strings. Nothing under `src/features/voice` or `src/app/api`. No new dependency.

## Build

1. **Consent.** A new string next to `checkVoice` in `consentCopy`, used by `ConsentForm` when the voice config's adapter is `server` (the `{processor}` text stays for the other adapters):
   - en: "Use my voice. Audio goes to WorkEspoo's own server, is turned into text there and is deleted straight away. It is not stored and no other company receives it."
   - fi: "Haluan vastata puhumalla. Ääni lähetetään WorkEspoon omalle palvelimelle, muutetaan siellä tekstiksi ja poistetaan heti. Ääntä ei tallenneta, eikä mikään muu yritys saa sitä."
   - sv: "Jag vill svara med rösten. Ljudet skickas till WorkEspoos egen server, görs om till text där och raderas direkt. Ljudet sparas inte, och inget annat företag får det."
   The wording shown to people changes, so `CONSENT_TEXT_VERSION` in `src/lib/consent.ts` becomes `2026-11-v2`.

2. **"How this works".** `VoiceProcessor` gains `server`, with its sentence for the `{voice}` placeholder:
   - en: "When you answer by voice, the audio goes to WorkEspoo's own server, where an open speech model turns it into text, and it is deleted as soon as that is done. No outside speech service hears it, and you can type instead. Where this server has it, the interviewer's voice is made on our own server."
   - fi: "Kun vastaat puhumalla, ääni lähetetään WorkEspoon omalle palvelimelle, jossa avoin puheentunnistusmalli muuttaa sen tekstiksi, ja ääni poistetaan heti sen jälkeen. Mikään ulkopuolinen puhepalvelu ei kuule sitä, ja voit myös kirjoittaa. Siellä, missä palvelimella on se käytössä, haastattelijan äänen tuottaa oma palvelimemme."
   - sv: "När du svarar med rösten skickas ljudet till WorkEspoos egen server, där en öppen taligenkänningsmodell gör om det till text, och ljudet raderas så snart det är gjort. Ingen utomstående taltjänst hör det, och du kan också skriva. Där servern har det görs intervjuarens röst på vår egen server."
   `voiceProcessor()` in `page.tsx` mirrors `/api/voice/config`: `none`, then ElevenLabs, then `server` when `VOICE_ADAPTER` is not `browser` and `await sttAvailable()` (from `@/features/voice/server/stt`; in your worktree that file is a placeholder whose functions throw, so mock it in tests and keep the `try/catch` that falls back to `browser`), else `browser`.

3. **Credits** (`credit` in `how-it-works.ts`): the speech model's licence asks for attribution.
   - en: "Skills taxonomy: ESCO, European Commission. Speech recognition: Parakeet TDT 0.6b v3 by NVIDIA (CC BY 4.0), run with sherpa-onnx. The interviewer's voice: Piper."
   - fi: "Osaamisluokitus: ESCO, Euroopan komissio. Puheentunnistus: NVIDIAn Parakeet TDT 0.6b v3 (CC BY 4.0), ajossa sherpa-onnx-ohjelmistolla. Haastattelijan ääni: Piper."
   - sv: "Klassificering av färdigheter: ESCO, Europeiska kommissionen. Taligenkänning: Parakeet TDT 0.6b v3 från NVIDIA (CC BY 4.0), körs med sherpa-onnx. Intervjuarens röst: Piper."

4. **Tests**: the new consent string exists in three languages, has no placeholder and names WorkEspoo; `ConsentForm` picks it for `server` and the old one otherwise (extend the existing test of `voiceServiceName` or add a small pure helper and test that); `voiceSentence` for `server` in three languages; `voiceProcessor()` for each case with the `stt` module mocked; the version constant.

## Watch out for

- Use the strings above exactly. Do not reword the Finnish or the Swedish.
- The consent kind in the database stays `voice_vendor`, and the request field stays `voiceVendor`: only the text changes.
- Nothing here may claim more than is true: the old sentences stay for the old adapters.
