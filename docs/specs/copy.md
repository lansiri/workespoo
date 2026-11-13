# Interface copy (talent side)

English and Finnish. Ids are stable keys for the string table. `{{…}}` are placeholders filled by code. Scripted interviewer lines (opening, closing, repair, fallback questions) live in `interview.md` §5, not here.

Tone: plain, warm, short, non-judgemental. Speak to the person as "you". No hype ("revolutionary", "smart", "magic"), no praise of the person, no exclamation marks, no blame for errors ("we couldn't", not "you didn't").

## 1. Consent screen

| Id | English | Finnish |
|---|---|---|
| `consent.title` | Before we start | Ennen kuin aloitetaan |
| `consent.intro` | You'll have a short conversation with an AI interviewer about your work. It takes notes, and you decide what to keep. | Käyt lyhyen keskustelun tekoälyhaastattelijan kanssa työstäsi. Se tekee muistiinpanoja, ja sinä päätät, mitä niistä jää. |
| `consent.point.ai` | The interviewer is an AI. It does not score you or judge your answers. | Haastattelija on tekoäly. Se ei pisteytä sinua eikä arvioi vastauksiasi. |
| `consent.point.review` | At the end you check the notes, change or remove anything, and approve them yourself. Nothing is used before that. | Lopuksi tarkistat muistiinpanot, muutat tai poistat mitä haluat ja hyväksyt ne itse. Mitään ei käytetä ennen sitä. |
| `consent.point.private` | Companies never see your name unless you agree to meet them. | Yritykset eivät näe nimeäsi, ellet itse suostu tapaamiseen. |
| `consent.point.dontshare` | You don't need to tell us your age, background, health, family or nationality. | Sinun ei tarvitse kertoa ikääsi, taustaasi, terveyttäsi, perhettäsi tai kansalaisuuttasi. |
| `consent.point.models` | Your words are processed by AI models from {{modelProviders}}. | Sanasi käsittelevät tekoälymallit, joiden tarjoaja on {{modelProviders}}. |
| `consent.check.interview` | I agree to the interview and to my notes being stored so I can review them. | Hyväksyn haastattelun ja sen, että muistiinpanoni tallennetaan tarkistettavaksi. |
| `consent.check.voice` | Use my voice. Audio is turned into text by {{voiceVendor}}, which may keep it under its own terms. WorkEspoo does not store audio. | Käytä ääntäni. {{voiceVendor}} muuttaa puheen tekstiksi ja voi säilyttää sen omien ehtojensa mukaan. WorkEspoo ei tallenna ääntä. |
| `consent.check.voice.help` | Leave this unticked to type instead. | Jätä tämä valitsematta, jos haluat kirjoittaa. |
| `consent.check.liveDemo` | I understand this is a live demo. Everything from this session is deleted after 24 hours. | Ymmärrän, että tämä on livedemo. Kaikki tämän istunnon tiedot poistetaan 24 tunnin kuluttua. |
| `consent.language` | Language for the interview | Haastattelun kieli |
| `consent.language.help` | You can switch language at any time just by speaking or writing in it. | Voit vaihtaa kieltä milloin tahansa puhumalla tai kirjoittamalla sillä. |
| `consent.cv.label` | Add a CV (optional) | Lisää CV (vapaaehtoinen) |
| `consent.cv.help` | It's only used to suggest up to two questions, then deleted. Your notes come from what you say. | Sitä käytetään vain enintään kahden kysymyksen ehdottamiseen, minkä jälkeen se poistetaan. Muistiinpanot syntyvät siitä, mitä kerrot. |
| `consent.link.how` | How this works | Näin palvelu toimii |
| `consent.start` | Start the conversation | Aloita keskustelu |
| `consent.prototype` | Hackathon prototype, not an official City of Espoo service. | Hackathon-prototyyppi, ei Espoon kaupungin virallinen palvelu. |

`consent.check.interview` is required. `consent.check.liveDemo` is required for live demo sessions and hidden otherwise. Without `consent.check.voice`, the interview opens in text mode.

## 2. AI disclosure line

Shown permanently at the top of the interview screen.

| Id | English | Finnish |
|---|---|---|
| `ai.disclosure` | You're talking with an AI. It takes notes; you review and approve them at the end. | Keskustelet tekoälyn kanssa. Se tekee muistiinpanoja, jotka tarkistat ja hyväksyt lopuksi. |

## 3. Interview screen

| Id | English | Finnish |
|---|---|---|
| `interview.hold` | Hold to talk | Pidä pohjassa ja puhu |
| `interview.release` | Release to send | Päästä irti, niin viesti lähtee |
| `interview.listening` | Listening… | Kuuntelen… |
| `interview.thinking` | Writing a question… | Kirjoitan kysymystä… |
| `interview.switchText` | Type instead | Kirjoita mieluummin |
| `interview.switchVoice` | Talk instead | Puhu mieluummin |
| `interview.textPlaceholder` | Write your answer | Kirjoita vastauksesi |
| `interview.send` | Send | Lähetä |
| `interview.skip` | Skip question | Ohita kysymys |
| `interview.stop` | Stop | Lopeta |
| `interview.stop.confirm` | Stop the interview? You can still review the notes made so far. | Lopetetaanko haastattelu? Voit silti tarkistaa tähänastiset muistiinpanot. |
| `interview.progress` | Question {{n}} of {{total}} | Kysymys {{n}}/{{total}} |
| `interview.hint.noisy` | In a noisy place, hold the button only while you speak. | Meluisassa paikassa pidä nappia pohjassa vain puhuessasi. |
| `interview.hint.interrupt` | You can press the button to interrupt at any time. | Voit keskeyttää painamalla nappia milloin tahansa. |
| `interview.notes.title` | Notes so far | Muistiinpanot tähän asti |
| `interview.notes.help` | You'll check and edit these at the end. | Tarkistat ja muokkaat näitä lopuksi. |
| `interview.removeAnswer` | Remove this answer | Poista tämä vastaus |
| `interview.jobsLit` | {{count}} open jobs mention this | {{count}} avointa työpaikkaa mainitsee tämän |
| `interview.preparing` | Preparing your notes… | Valmistelen muistiinpanojasi… |

## 4. Card review

| Id | English | Finnish |
|---|---|---|
| `card.title` | Your Signal Card | Signal Card -korttisi |
| `card.intro` | These are notes from your conversation. Check them, change anything, and approve only what you're happy with. | Nämä ovat muistiinpanot keskustelustasi. Tarkista ne, muuta mitä haluat ja hyväksy vain se, mihin olet tyytyväinen. |
| `card.handle` | Companies will see you as {{handle}}. | Yritykset näkevät sinut nimellä {{handle}}. |
| `card.group.skill` | What I do | Mitä teen |
| `card.group.tool` | Tools | Työkalut |
| `card.group.knowledge` | Know-how | Osaaminen |
| `card.group.domain` | Fields | Alat |
| `card.yourWords` | Your words | Omat sanasi |
| `card.companySees` | Shown to companies as | Yritykset näkevät tämän näin |
| `card.renderingLabel` | Written by AI from your own words. Companies don't see your original words, your language or whether you spoke or typed. | Tekoäly kirjoitti tämän omien sanojesi pohjalta. Yritykset eivät näe alkuperäisiä sanojasi, kieltäsi tai sitä, puhuitko vai kirjoititko. |
| `card.noEsco` | No ESCO match. That's fine; it stays on your card. | Ei ESCO-vastinetta. Se ei haittaa, tämä pysyy kortillasi. |
| `card.edit` | Edit | Muokkaa |
| `card.remove` | Remove | Poista |
| `card.undo` | Undo | Kumoa |
| `card.removed` | Removed. | Poistettu. |
| `card.add` | Add your own | Lisää oma |
| `card.add.phrase` | What can you do? (a few words) | Mitä osaat? (muutama sana) |
| `card.add.words` | In your own words (optional) | Omin sanoin (vapaaehtoinen) |
| `card.add.wordsHelp` | One to three sentences about when you did it. | Yhdestä kolmeen lausetta siitä, milloin teit sitä. |
| `card.addedByYou` | Added by you | Lisäsit itse |
| `card.sensitiveWarning` | Companies will see this. You don't need to share it. | Yritykset näkevät tämän. Sinun ei tarvitse kertoa sitä. |
| `card.transcript.title` | Your answers | Vastauksesi |
| `card.transcript.help` | Speech recognition makes mistakes, especially with accents. Tap a sentence to fix it. | Puheentunnistus tekee virheitä, varsinkin aksenttien kanssa. Napauta lausetta korjataksesi sen. |
| `card.transcript.fix` | Fix this sentence | Korjaa lause |
| `card.transcript.save` | Save | Tallenna |
| `card.transcript.corrected` | Corrected | Korjattu |
| `card.transcript.lostEvidence` | This note had no words left, so it was removed. | Tällä muistiinpanolla ei ollut enää sanoja, joten se poistettiin. |
| `card.lookingFor.title` | What you're looking for | Mitä etsit |
| `card.lookingFor.help` | All optional. Companies can see this. | Kaikki vapaaehtoista. Yritykset näkevät nämä. |
| `card.lookingFor.roles` | Kinds of work | Millaista työtä |
| `card.lookingFor.workMode` | Where you'd like to work | Missä haluaisit työskennellä |
| `card.workMode.onsite` / `.hybrid` / `.remote` / `.any` | On site / Hybrid / Remote / Any | Työpaikalla / Hybridi / Etänä / Mikä tahansa |
| `card.lookingFor.start` | When you could start | Milloin voisit aloittaa |
| `card.start.now` / `.within_1_month` / `.within_3_months` / `.later` | Now / Within a month / Within three months / Later | Heti / Kuukauden sisällä / Kolmen kuukauden sisällä / Myöhemmin |
| `card.lookingFor.languages` | Languages you'd like to work in | Kielet, joilla haluaisit työskennellä |
| `card.preview.title` | What companies see | Mitä yritykset näkevät |
| `card.purgeNotice` | This is a live demo session. Everything is deleted {{time}}. | Tämä on livedemo. Kaikki poistetaan {{time}}. |

## 5. Approval

| Id | English | Finnish |
|---|---|---|
| `card.approve` | Approve my card | Hyväksy korttini |
| `card.approve.preparing` | Preparing company view… | Valmistelen yritysnäkymää… |
| `card.approve_empty` | Keep at least one note, or add your own, to approve. | Jätä vähintään yksi muistiinpano tai lisää oma, niin voit hyväksyä. |
| `card.approved` | Approved. You can change your card at any time. | Hyväksytty. Voit muuttaa korttiasi milloin tahansa. |
| `card.editAgain` | Edit my card | Muokkaa korttiani |
| `card.editAgain.help` | Your approved card stays in use until you approve the new version. | Hyväksytty korttisi on käytössä, kunnes hyväksyt uuden version. |
| `card.discardDraft` | Discard changes | Hylkää muutokset |

## 6. Pool opt-in

| Id | English | Finnish |
|---|---|---|
| `pool.title` | Can Espoo suggest you to companies? | Saako Espoo ehdottaa sinua yrityksille? |
| `pool.body` | If you say yes, your approved card (without your name) can be suggested to companies at this event. An Espoo organiser checks every suggestion. Your name is shared only if a company asks to meet you and you agree. | Jos vastaat kyllä, hyväksyttyä korttiasi (ilman nimeäsi) voidaan ehdottaa tapahtuman yrityksille. Espoon järjestäjä tarkistaa jokaisen ehdotuksen. Nimesi kerrotaan vain, jos yritys pyytää tapaamista ja suostut siihen. |
| `pool.liveDemo` | This is a live demo session, so everything is still deleted after 24 hours. | Tämä on livedemo, joten kaikki poistetaan silti 24 tunnin kuluttua. |
| `pool.yes` | Yes, suggest me | Kyllä, saa ehdottaa |
| `pool.no` | Not now | Ei nyt |
| `pool.no.help` | You'll still see open jobs that match your card. | Näet silti korttiisi sopivat avoimet työpaikat. |
| `pool.status.in` | You're in the pool. | Olet mukana ehdotettavien joukossa. |
| `pool.status.out` | You're not in the pool. | Et ole mukana ehdotettavien joukossa. |
| `pool.leave` | Leave the pool | Poistu joukosta |
| `pool.leave.confirm` | Leave the pool? Pending suggestions are removed. Meetings you already agreed to stay until you cancel them. | Poistutaanko joukosta? Odottavat ehdotukset poistetaan. Jo sovitut tapaamiset säilyvät, kunnes perut ne. |

## 7. Your data

| Id | English | Finnish |
|---|---|---|
| `data.export` | Download my data | Lataa tietoni |
| `data.export.help` | A file with your answers, your card and your consents. | Tiedosto, jossa ovat vastauksesi, korttisi ja suostumuksesi. |
| `data.delete` | Delete everything | Poista kaikki |
| `data.delete.confirm` | Delete your answers, your card and everything linked to them? This can't be undone. | Poistetaanko vastauksesi, korttisi ja kaikki niihin liittyvä? Tätä ei voi perua. |
| `data.delete.yes` | Yes, delete everything | Kyllä, poista kaikki |
| `data.deleted` | Everything has been deleted. | Kaikki on poistettu. |

## 8. Errors and empty states

| Id | English | Finnish |
|---|---|---|
| `error.mic.denied` | We can't use your microphone. You can allow it in your browser settings, or type instead. | Mikrofonia ei voi käyttää. Voit sallia sen selaimen asetuksista tai kirjoittaa vastauksesi. |
| `error.mic.unsupported` | Voice doesn't work in this browser. You can type instead. | Puhe ei toimi tässä selaimessa. Voit kirjoittaa vastauksesi. |
| `error.voice.failed` | We couldn't turn that into text. Please try again, or type it. | Emme saaneet puhetta tekstiksi. Yritä uudelleen tai kirjoita. |
| `error.network` | The connection dropped. Your answers so far are saved. | Yhteys katkesi. Tähänastiset vastauksesi on tallennettu. |
| `error.retry` | Try again | Yritä uudelleen |
| `error.model.slow` | This is taking longer than usual. One moment. | Tämä kestää tavallista kauemmin. Hetki vain. |
| `error.synthesis` | We couldn't prepare all your notes. You can add your own and approve when ready. | Emme saaneet kaikkia muistiinpanoja valmiiksi. Voit lisätä omia ja hyväksyä, kun olet valmis. |
| `error.save` | We couldn't save that change. Please try again. | Muutosta ei voitu tallentaa. Yritä uudelleen. |
| `cv.failed` | We couldn't read the CV. That's fine, the interview works without it. | CV:tä ei voitu lukea. Se ei haittaa, haastattelu toimii ilman sitä. |
| `cv.tooLarge` | That file is too large. The limit is 2 MB. | Tiedosto on liian suuri. Enimmäiskoko on 2 Mt. |
| `session.expired` | This session has ended and its data has been deleted. | Tämä istunto on päättynyt ja sen tiedot on poistettu. |
| `session.idle` | The conversation paused because nothing happened for a while. You can start a new one. | Keskustelu keskeytyi, koska mitään ei tapahtunut hetkeen. Voit aloittaa uuden. |
| `card.empty` | No notes yet. Add your own to get started. | Ei vielä muistiinpanoja. Aloita lisäämällä oma. |
