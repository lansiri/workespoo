# Status board

Updated by the lead. Times are Helsinki time.

## Now (Fri 13 Nov, 23:25)

**Phase 1 is done except for a voice check by a person. Phase 2 streams are built and going through review.**

| Item | State |
|---|---|
| Server: hardened, key-only SSH, firewall, TLS, push-to-deploy with rollback | done and proven |
| Live site https://workespoo.aichat.fi | serving the real app (first deploy 22:55) |
| Model: `kimi-k3-1-pro` on Verda, all three roles | answering from the server through the gateway, first word in under a second |
| Live database | 1,338 Espoo postings (486 with direct ESCO skills, 94 in English, 67 public sector), 15,152 ESCO skills, 3,117 occupations, 24,682 occupation-to-skill links |
| Three languages, logo, shared library, contracts, schema | done |
| Voice | built; not yet tried in a real browser, and no ElevenLabs key |

## Phase 2 streams

| Stream | State |
|---|---|
| S1b Signal Card | **merged** after review: 11 findings, 8 confirmed and fixed, 1 refuted, 2 lead decisions recorded |
| S1a Interview engine | built (436 tests on its branch), in review |
| S2 Need Cards | built (369 tests), in review |
| S3a Matching and job feed | built (349 tests), in review |
| S4 Synthetic world | built (362 tests), in review; has only run against stand-ins so far |
| S3b Picks, organiser console, introductions | building |

## Also running

- Prompt lab: seven product prompts tried on the real model in three languages, each failure re-run by an independent verifier.
- Coming-soon page: three concepts, a judging panel, build, review.

## Waiting on the owner

1. Try voice at `/dev/voice` in Chrome (hold to talk). Optional: an ElevenLabs key for natural voice.

## Gates

- [x] Gate 1: live URL over HTTPS, deploy and rollback proven, streamed model turn from the server, 1,000+ Espoo postings and ESCO in the database. Open item: a voice round trip tried by a person.
- [ ] Gate 2: full path works end to end on unstyled pages; evaluation report from simulated interviews
- [ ] Gate 3: styled product, golden-path test green on the live site, backup video, demo freeze
