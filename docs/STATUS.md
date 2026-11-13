# Status board

Updated by the lead. Times are Helsinki time.

## Now (Fri 13 Nov, 22:35)

**Phase 1 is nearly complete; Phase 2 streams are running.**

| Item | State |
|---|---|
| Repo, rules, plan, research notes | done |
| App scaffold: Next.js 16, tests, Dockerfile, CI | done |
| 18 spec documents (interview, card, needs, matching, picks, organiser, company, synthetic world, demo script) | done |
| Contracts and database schema (31 tables) | done, frozen |
| Shared library: sessions, audit, consent, queue, streaming, word lists | done |
| Model gateway (Nemotron, DeepSeek, Kimi; fallback; fake and replay for tests) | done; not yet run against a real model |
| ESCO import, Työmarkkinatori ingestion, fixtures from real postings | done; live run verified |
| Voice layer: push-to-talk, browser and ElevenLabs adapters | done; not yet run in a real browser or with a key |
| Three languages: English, Finnish, Swedish; language switcher | done |
| Logo, brand palette, favicon | done |
| Server: password changed, key login, hardening, TLS, deploy pipeline | **in progress** (infra agent) |
| First real deploy to https://workespoo.aichat.fi | after the server work |

## Phase 2 streams (running)

| Stream | Builds |
|---|---|
| S1a | Interview engine and its pages |
| S1b | Signal Card: synthesis, review, approval |
| S2 | Need Cards, pool evidence, the company's Need Card page |
| S3a | Eligibility and the person's job feed |
| S3b | Daily picks, organiser review, company digest, introductions |
| S4 | Synthetic personas, simulated interviews, seeding, evaluation |

## Waiting on the owner

1. A model key: Verda (DeepSeek, Kimi) or NVIDIA (Nemotron). Nothing AI-driven can run for real until then.
2. Optional: an ElevenLabs key for natural voice.

## Gates

- [ ] Gate 1: live URL over HTTPS, deploy and rollback proven, streamed model turn, voice round trip, 1,000+ Espoo postings and ESCO in the database
- [ ] Gate 2: full path works end to end on unstyled pages; evaluation report from simulated interviews
- [ ] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze
