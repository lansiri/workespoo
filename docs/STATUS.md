# Status board

Updated by the lead. Times are Helsinki time.

## Now (Sat 14 Nov, 03:15)

**Every feature is built, reviewed twice and merged. The product runs end to end on the live site with the real model. The designed interface is being built on top of the working pages, and the demo world is being generated with the real model.**

| Item | State |
|---|---|
| Live site https://workespoo.aichat.fi | serving main (commit af2baf1): working pages in the shared site shell with the language switcher, still unstyled inside; the front page is the coming-soon page until the designed front door replaces it |
| Server | hardened, key-only SSH, firewall, TLS, push-to-deploy with rollback; image 1.9 GB; 2 cores, 4 GB |
| Model | `kimi-k3-1-pro` on Verda for all three roles. **Limit: 40 requests a minute for the whole key.** The provider was unreachable for 24 minutes at 02:04 (its domain served a parking page); the gateway now treats an empty answer as a failure and moves on |
| Voice | Works without any key: the server speaks with Piper in English, Finnish and Swedish (0.2 to 0.65 s per sentence, measured on the server). The browser listens (Chrome). An ElevenLabs key would only improve how it sounds |
| Live database | 1,338 Espoo postings, 15,152 ESCO skills, 3,117 occupations, 24,682 occupation-to-skill links |
| Tests on main | 1,341 passing |

## Built and merged

| Part | What is in it |
|---|---|
| Model gateway | one request budget shared by web and worker, live calls first, a deadline on every call, retries, an audit row per call |
| Interview | AI interviewer in three languages, a note per answer pointing at the person's sentence, CV as a source of questions only, removing an answer, consent and the 24-hour purge |
| Signal Card | notes with the person's own words by reference, edit and approve, a rewrite before a company sees an edited phrase, ESCO labels chosen among candidates, export and delete |
| Need Cards | drafted from real postings, requirements as must or nice, questions back to the employer (for example whether Finnish is needed from day one), refusal of origin requirements |
| Matching and job feed | real open jobs related to the person's notes, with a reason per job and what was not mentioned |
| Picks and introductions | daily drafts per company, one-by-one organiser approval with reasons for removal, publishing, ask to meet, accept, mutual reveal, audit log, exposure page, demo reset |
| Synthetic world | 15 personas, a simulator that goes through the real interview, the seed, a snapshot for resetting, an evaluation report |
| Design | "Clear signal" design system (`docs/design/DESIGN.md`), prototypes for every screen, a kit of 36 components (`/dev/design`) |

## Running now

| Task | What it does |
|---|---|
| Interview room screen | the designed room: orb, transcript, notes appearing, jobs lighting up; also fixes speech cutting itself off |
| Signal Card and My matches screens | the designed card review and job feed |
| Organiser screens | review queue, audit log, exposure, settings |
| Company screens | the daily picks page and the Need Card editor |
| Site pages | the front door (keeps the joke), how it works, consent, not-found |
| Demo world | 15 simulated interviews with the real model in the lab database, then a snapshot that resets the live demo without a model |

Each screen group is one builder, then three reviewers who open the screens in a browser (looks, product rules and accessibility, behaviour), a fixer and a re-check.

## Next

1. Merge the screens, deploy, restore the demo world on the server.
2. Golden-path test on the live site, the three-minute demo script updated to what is built, a backup video.
3. Evaluation report from 20 simulated interviews; pitch notes; demo freeze.

## Waiting on the owner

1. **Model capacity.** 40 requests a minute is enough for one or two people talking at once, not for a room of judges trying it together, and tonight the only provider was down for 24 minutes. A second provider (an NVIDIA key, or another OpenAI-compatible endpoint) or a higher limit would remove both risks.
2. **GitHub mirror.** The connection here uploads at about 0.9 Mbit/s, and pushing the 44 MB of design screenshots to GitHub starved everything else twice. The mirror is 61 commits behind; the server holds everything. It will be pushed in small steps when the machine is quiet.
3. Try voice at `/dev/voice` in Chrome (hold to talk). Only a person can judge how it sounds.
4. Is the deadline Sunday 10:00, and what does the submission need (video, repository link, slides)?
5. After the event: rotate the Verda key, since it was pasted into the chat.

## Gates

- [x] Gate 1: live URL over HTTPS, deploy and rollback proven, streamed model turn from the server, 1,000+ Espoo postings and ESCO in the database, voice round trip from the server.
- [x] Gate 2 (path): the full path works end to end with the real model on unstyled pages. Open: the evaluation report from 20 simulated interviews.
- [ ] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze
