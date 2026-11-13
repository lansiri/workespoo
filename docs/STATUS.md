# Status board

Updated by the lead. Times are Helsinki time.

## Now (Sat 14 Nov, 00:15)

**All six feature streams are built, reviewed and merged. The second pass is running: it applies what the real model taught us, the decisions from the reviews, and the first journey through every feature together.**

| Item | State |
|---|---|
| Live site https://workespoo.aichat.fi | serving main; the front page is the coming-soon page ("Can't find a job in the current market?? Try WORKESPOO. LUL") in three languages |
| Server | hardened, key-only SSH, firewall, TLS, push-to-deploy with rollback; disk kept in check (smaller images, less build cache) |
| Model | `kimi-k3-1-pro` on Verda for all three roles; first word in under a second. **Limit: 40 requests a minute for the whole key** |
| Live database | 1,338 Espoo postings, 15,152 ESCO skills, 3,117 occupations, 24,682 occupation-to-skill links |
| Tests on main | 955 passing |

## Phase 2 streams (first pass)

| Stream | State |
|---|---|
| S1a Interview engine | merged; review found 9 problems, all fixed |
| S1b Signal Card | merged; 8 fixed |
| S2 Need Cards | merged; 9 fixed |
| S3a Matching and job feed | merged; 5 fixed |
| S3b Picks, organiser review, introductions | merged; 10 fixed |
| S4 Synthetic world (15 personas, simulator, seed, evaluation) | merged; 8 fixed |

## Running now

Each second-pass task is one builder followed by four reviewers, a verifier per finding, a fixer and a re-check. Briefs: `docs/briefs/p2-*.md`.

| Task | What it does |
|---|---|
| Gateway | Paces model requests under the shared limit, serves live calls first, bounds every call with a deadline |
| Shared library | Employer masking that respects words; recruiter names removed from postings |
| S1a | Guard and prompt changes the real model needs; consent and retention; CV as a source of questions; removing an answer |
| S1b | Prompt changes; an edited phrase is rewritten before a company sees it; export and delete of a person's data |
| S2 | Need Card drafting fixed for the real model (it failed about half the time); statutory rules; roles and deadlines |
| S3a | A feed that appears at once and spends few model calls; reasons that rest on real links |
| S3b | Out-of-date picks refreshed without removing anyone; audit log page; exposure page; demo reset |
| S4 | One journey through every real feature as a test; labelling; run reports for the real-model pass |
| Design | Three competing visual directions for the interview room, the card and the organiser queue; a judging panel; a design system; a component kit |

## Next

1. Merge the second pass, deploy, then run the seed and 20 simulated interviews against the real model on the server (Gate 2).
2. Restyle every screen with the component kit (Phase 3), golden-path test on the live site, backup video, demo freeze.

## Waiting on the owner

1. **Model capacity.** 40 requests a minute is enough for one or two people talking at once, not for a room of judges trying it together. A higher limit, a second key, or an NVIDIA key as a fallback would remove the risk.
2. Try voice at `/dev/voice` in Chrome (hold to talk). Optional: an ElevenLabs key for natural voice.
3. Is the deadline Sunday 10:00?

## Gates

- [x] Gate 1: live URL over HTTPS, deploy and rollback proven, streamed model turn from the server, 1,000+ Espoo postings and ESCO in the database. Open item: a voice round trip tried by a person.
- [ ] Gate 2: full path works end to end on unstyled pages; evaluation report from simulated interviews
- [ ] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze
